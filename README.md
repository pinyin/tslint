# tslint

[![Build Status](https://travis-ci.com/pinyin/tslint.svg?branch=master)](https://travis-ci.com/pinyin/tslint)

TSLint rules.

Should work for JavaScript projects, too.

## Usage

Add this library to project

```
npm install --save-dev @pinyin/tslint tslint-language-service typescript tslint
```

Then, edit `tsconfig.json` to include:

```json
{
  "compilerOptions": {
    "allowJs": true,
    "plugins": [
      {
        "name": "tslint-language-service",
        "mockTypeScriptVersion": true
      }
    ]
  }
}
```

If you are not using TypeScript, create a `tsconfig.json` file at the root of your project.

Edit `tslint.json` to include:

```json
{
  "defaultSeverity": "error",
  "rules": {
    "only-import-from-index": true
  },
  "rulesDirectory": [
    "node_modules/@pinyin/tslint/js"
  ]
}
```

If you are not using TSLint, create a `tslint.json` file at the root of your project.

[Enable TypeScript in your IDE](https://github.com/Microsoft/TypeScript/wiki/TypeScript-Editor-Support). You should be able to write JavaScript/TypeScript like before, with some additional checks.

TSLint would start with TypeScript Language Service, so there's no need to enable TSLint in your IDE.

## Rules

### only-import-from-index

If a directory contains an index.js/index.ts file, files outside of the directory can only import from index.js/index.ts file. No import can "pass through" the index file.

For example, given the following file structure: 

```
src/
    index.ts(content):
        export {a} from './public'
    public.ts:
        import {b} from './private' // ok
        export const a = b
    private.ts:
        export const b = 'b'
out.ts:
    import {a} from './src' // ok
    import {b} from './src/private.ts' // error
    import {a} from './src/public.ts' // error
```

`out.ts` can only import from `./src`, any other import into `src` will be reported as Error.

Only imports with relevant path will be checked.
