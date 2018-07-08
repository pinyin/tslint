import * as path from 'path'
import {IRuleMetadata, ProgramAwareRuleWalker, RuleFailure, Rules} from 'tslint'
import * as ts from 'typescript'

export class OnlyImportFromIndexRule extends Rules.TypedRule {
    static metadata: IRuleMetadata = {
        ruleName: 'only-import-from-index',
        type: 'style',
        description: 'When a directory contains an file named index (e.g. index.ts, index.js), files outside of the directory can no longer import other files in the directory except the index. Only import statements are checked at this moment.',
        options: null,
        optionsDescription: '',
        typescriptOnly: false,
    }

    applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): RuleFailure[] {
        const walker = new Walker(sourceFile, this.getOptions(), program)
        return this.applyWithWalker(walker)
    }
}

export const Rule = OnlyImportFromIndexRule // For naming conversion

class Walker extends ProgramAwareRuleWalker {
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
        if (!moduleLiteral.startsWith('.')) {
            return
        }
        const moduleResolved = ts.resolveModuleName(moduleLiteral, fromPath, compilerOptions, ts.sys)
        if (!moduleResolved || !moduleResolved.resolvedModule) {
            return
        }
        const targetPath = path.normalize(moduleResolved.resolvedModule.resolvedFileName)

        const fromAncestors = getAncestorsUntil(fromPath, baseDIR)
        const targetAncestors = getAncestorsUntil(targetPath, baseDIR).reverse()
        for (const targetAncestor of targetAncestors) {
            if (fromAncestors.includes(targetAncestor)) {
                continue
            }
            const relativePath = path.relative(path.dirname(fromPath), targetAncestor)
            const prefix = relativePath.startsWith('.') ? '' : './'
            const potentialIndexedModule = `${prefix}${relativePath}` // TODO
            const resolvedIndex = ts.resolveModuleName(potentialIndexedModule, fromPath, compilerOptions, ts.sys)
            if (!resolvedIndex || !resolvedIndex.resolvedModule) {
                continue
            }
            const indexPath = path.normalize(resolvedIndex.resolvedModule.resolvedFileName)
            if (indexPath !== targetPath) {
                this.addFailureAtNode(node, errorMessage(potentialIndexedModule))
                // TODO add fix
                break
            }
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

function errorMessage(dir: string): string {
    const module = dir.replace('\\', '/')
    return `Directory '${module}' has index file. Please import from '${module}' instead.`
}
