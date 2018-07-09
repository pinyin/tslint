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

type Path = string

class Walker extends ProgramAwareRuleWalker {
    protected visitSourceFile(node: ts.SourceFile): void {
        node.statements
            .filter(statement => ts.isImportDeclaration(statement))
            .forEach(statement => this.visitImportDeclaration(statement as ts.ImportDeclaration))
    }

    private hasIndex = new Map<Path, boolean>()
    private indexAtPath = new Map<Path, Path>()

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

        const fromAncestors = getAncestorsSince(fromPath, baseDIR)
        const targetAncestors = getAncestorsSince(targetPath, baseDIR)
        for (const targetAncestor of targetAncestors) {
            if (fromAncestors.includes(targetAncestor)) {
                continue
            }
            const relativePath = path.relative(path.dirname(fromPath), targetAncestor)
            const prefix = relativePath.startsWith('.') ? '' : './'
            const potentialIndexedPath = `${prefix}${relativePath}` // TODO
            if (this.hasIndex.get(targetAncestor) === undefined) {
                const resolvedIndex = ts.resolveModuleName(potentialIndexedPath, fromPath, compilerOptions, ts.sys)
                if (resolvedIndex && resolvedIndex.resolvedModule) {
                    this.indexAtPath.set(targetAncestor, path.normalize(resolvedIndex.resolvedModule.resolvedFileName))
                    this.hasIndex.set(targetAncestor, true)
                } else {
                    this.hasIndex.set(targetAncestor, false)
                }
            }
            const notImportingFromIndex = targetPath !== this.indexAtPath.get(targetAncestor)
            if (this.hasIndex.get(targetAncestor) && notImportingFromIndex) {
                this.addFailureAtNode(node, errorMessage(potentialIndexedPath))
                // TODO add fix
                break
            }
        }
    }
}

function getAncestorsSince(of: Path, since: Path): Array<string> {
    const result = []
    for (let current = path.normalize(path.dirname(of));
         current.startsWith(since);
         current = path.join(current, '..')
    ) {
        result.push(current)
    }
    return result.reverse()
}

function errorMessage(dir: Path): string {
    const module = dir.replace(/\\/g, '/')
    return `Directory '${module}' has index file. Please import from '${module}' instead.`
}
