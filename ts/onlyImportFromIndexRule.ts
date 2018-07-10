import {assume, Maybe, notExisting} from '@pinyin/maybe'
import * as path from 'path'
import * as tslint from 'tslint'
import * as ts from 'typescript'

export class OnlyImportFromIndexRule extends tslint.Rules.TypedRule {
    static metadata: tslint.IRuleMetadata = {
        ruleName: 'only-import-from-index',
        type: 'style',
        description: 'When a directory contains an file named index (e.g. index.ts, index.js), files outside of the directory can no longer import other files in the directory except the index. Only import statements are checked at this moment.',
        options: null,
        optionsDescription: '',
        typescriptOnly: false,
    }

    applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program): tslint.RuleFailure[] {
        const walker = new Walker(sourceFile, this.getOptions(), program)
        return this.applyWithWalker(walker)
    }
}

export const Rule = OnlyImportFromIndexRule // For naming conversion

type Path = string

class Walker extends tslint.ProgramAwareRuleWalker {
    protected visitSourceFile(node: ts.SourceFile): void {
        node.statements
            .filter(statement => ts.isImportDeclaration(statement))
            .forEach(statement => this.visitImportDeclaration(statement as ts.ImportDeclaration))

        node.statements
            .filter(statement => ts.isExportDeclaration(statement))
            .forEach(statement => this.visitExportDeclaration(statement as ts.ExportDeclaration))
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
        const indexedAncestor = this.getIndexedPath(moduleLiteral, fromPath)

        if (notExisting(indexedAncestor)) {
            return
        }

        const fix = assume(node.moduleSpecifier, specifier => {
            const start = specifier.getFullStart()
            const width = specifier.getFullWidth()
            return new tslint.Replacement(start, width, indexedAncestor)
        })
        this.addFailureAtNode(
            node,
            errorMessage(indexedAncestor),
            fix,
        )
    }

    protected visitExportDeclaration(node: ts.ExportDeclaration): void { // why TSLint doesn't have this method
        if (notExisting(node.moduleSpecifier) || !ts.isStringLiteral(node.moduleSpecifier)) {
            return
        }
        if (!node.parent || !ts.isSourceFile(node.parent)) {
            return
        }
        const fromPath = path.normalize(node.parent.fileName)
        const moduleLiteral = node.moduleSpecifier.text
        const indexedAncestor = this.getIndexedPath(moduleLiteral, fromPath)

        if (notExisting(indexedAncestor)) {
            return
        }

        const fix = assume(node.moduleSpecifier, specifier => {
            const start = specifier.getFullStart()
            const width = specifier.getFullWidth()
            return new tslint.Replacement(start, width, indexedAncestor)
        })
        this.addFailureAtNode(
            node,
            errorMessage(indexedAncestor),
            fix,
        )
    }

    private getIndexedPath(moduleSpecifierText: string, fromPath: Path): Maybe<Path> {
        const compiler = this.getProgram()
        const compilerOptions = compiler.getCompilerOptions()
        const baseDIR = path.normalize(compiler.getCurrentDirectory()) // fixme

        if (!moduleSpecifierText.startsWith('.')) {
            return null
        }
        const moduleResolved = ts.resolveModuleName(moduleSpecifierText, fromPath, compilerOptions, ts.sys)
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
            const potentialIndexedImport = `${prefix}${relativePath}` // TODO
            let hasIndex = this.hasIndex.get(targetAncestor)
            if (notExisting(hasIndex)) {
                const resolvedIndex = ts.resolveModuleName(potentialIndexedImport, fromPath, compilerOptions, ts.sys)
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
                return potentialIndexedImport
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
