import * as path from 'path'
import * as tsLint from 'tslint'
import * as ts from 'typescript'

export class OnlyRequireFromIndexRule extends tsLint.Rules.TypedRule {
    static metadata: tsLint.IRuleMetadata = {
        ruleName: 'only-require-from-index',
        type: 'style',
        description: 'When a directory contains an file named index (e.g. index.ts, index.js), files outside of the directory can no longer import other files in the directory except the index. Only import statements are checked at this moment.',
        options: null,
        optionsDescription: '',
        typescriptOnly: false,
    }

    applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): tsLint.RuleFailure[] {
        const walker = new Walker(sourceFile, this.getOptions(), program)
        return this.applyWithWalker(walker)
    }
}

export const Rule = OnlyRequireFromIndexRule // For naming conversion

class Walker extends tsLint.ProgramAwareRuleWalker {
    protected visitSourceFile(node: ts.SourceFile): void {
        node.statements
            .filter(statement => ts.isImportDeclaration(statement))
            .forEach(statement => this.visitImportDeclaration(statement as ts.ImportDeclaration))
    }

    protected visitImportDeclaration(node: ts.ImportDeclaration): void {
        if (!ts.isStringLiteral(node.moduleSpecifier)) {
            return
        }
        if (!node.parent || !ts.isSourceFile(node.parent)) {
            return
        }

        const compiler = this.getProgram()
        const compilerOptions = compiler.getCompilerOptions()
        const baseDIR = path.normalize(compiler.getCurrentDirectory()) // fixme

        const fromPath = path.normalize(node.parent.fileName)
        const moduleLiteral = node.moduleSpecifier.text
        const moduleResolved = ts.resolveModuleName(moduleLiteral, fromPath, compilerOptions, ts.sys)
        if (!moduleResolved || !moduleResolved.resolvedModule) {
            return
        }
        const targetPath = path.normalize(moduleResolved.resolvedModule.resolvedFileName)

        const fromAncestors = getAncestorsUntil(fromPath, baseDIR)
        const targetAncestors = getAncestorsUntil(targetPath, baseDIR)
        for (const targetAncestor of targetAncestors) {
            if (fromAncestors.includes(targetAncestor)) {
                break
            }
            const potentialIndexedModule = `./${path.relative(path.dirname(fromPath), targetAncestor)}` // TODO
            const resolvedIndex = ts.resolveModuleName(potentialIndexedModule, fromPath, compilerOptions, ts.sys)
            if (!resolvedIndex || !resolvedIndex.resolvedModule) {
                continue
            }
            const indexPath = path.normalize(resolvedIndex.resolvedModule.resolvedFileName)
            if (indexPath === targetPath) {
                break // already importing from index
            }
            this.addFailureAtNode(node, errorMessage(potentialIndexedModule))
        }
    }
}

function getAncestorsUntil(of: string, until: string): Array<string> {
    const result = []
    for (let current = path.normalize(path.dirname(of));
         current.startsWith(until);
         current = path.join(current, '..')
    ) {
        result.push(current)
    }
    return result
}

function errorMessage(path: string): string {
    return `Directory '${path}' has index file. Please require from '${path}' instead.`
}
