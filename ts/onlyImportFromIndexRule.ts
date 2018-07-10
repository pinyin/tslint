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

        const fromPath = path.normalize(node.parent.fileName)
        const moduleLiteral = node.moduleSpecifier.text

        const potentialIndexedPath = this.getIndexedPath(moduleLiteral, fromPath)

        if (potentialIndexedPath) {
            this.addFailureAtNode(node, errorMessage(potentialIndexedPath))
        }
    }

    private getIndexedPath(moduleLiteral: string, fromPath: Path): Path | null {
        const compiler = this.getProgram()
        const compilerOptions = compiler.getCompilerOptions()
        const baseDIR = path.normalize(compiler.getCurrentDirectory()) // fixme

        if (!moduleLiteral.startsWith('.')) {
            return null
        }
        const moduleResolved = ts.resolveModuleName(moduleLiteral, fromPath, compilerOptions, ts.sys)
        if (!moduleResolved || !moduleResolved.resolvedModule) {
            return null
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
            const potentialIndexedImportLiteral = `${prefix}${relativePath}` // TODO
            let hasIndex = this.hasIndex.get(targetAncestor)
            if (hasIndex === undefined) {
                const resolvedIndex = ts.resolveModuleName(potentialIndexedImportLiteral, fromPath, compilerOptions, ts.sys)
                if (resolvedIndex && resolvedIndex.resolvedModule) {
                    this.indexAtPath.set(targetAncestor, path.normalize(resolvedIndex.resolvedModule.resolvedFileName))
                    this.hasIndex.set(targetAncestor, true)
                    hasIndex = true
                } else {
                    this.hasIndex.set(targetAncestor, false)
                }
            }
            const notImportingFromIndex = targetPath !== this.indexAtPath.get(targetAncestor)
            if (hasIndex && notImportingFromIndex) {
                return potentialIndexedImportLiteral
            }
        }

        return null
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
