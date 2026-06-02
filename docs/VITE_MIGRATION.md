# Webpack to Vite Migration

## Summary

Successfully migrated from Webpack 5 to Vite 5.4.0 for faster builds and better developer experience.

## Changes Made

### 1. Configuration Files

#### Created

- `vite.config.dist.js` - Library build configuration (builds `dist/editable.js`)
- `vite.config.docs.js` - Examples build configuration (builds `examples/dist/bundle.js` and `examples/dist/styles.js`)

#### Removed

- `webpack.config.js` - No longer needed

### 2. Package Dependencies

#### Added

- `vite@^5.4.0` - Fast build tool
- `@vitejs/plugin-react@^4.3.0` - React plugin for Vite
- `vite-plugin-css-injected-by-js@^3.1.0` - Plugin to inject CSS as JS (for styles.js)

#### Removed

- `webpack@^5.68.0`
- `webpack-cli@^6.0.0`
- `webpack-dev-server@^5.0.0`
- `babel-loader@^10.0.0`
- `css-loader@^7.0.0`
- `style-loader@^4.0.0`
- `url-loader@^4.1.1`
- `ts-loader@^9.5.1`
- `babel-plugin-add-module-exports@^1.0.4`
- `@babel/cli@^7.16.8`
- `@babel/core@^7.16.12`
- `@babel/plugin-transform-runtime@^7.16.10`
- `@babel/preset-env@^7.16.11`
- `@babel/preset-react@^7.16.7`
- `@babel/preset-typescript@^7.16.0`

Note: `@babel/runtime` is kept as a dependency since it's used at runtime.

### 3. Build Scripts

Updated `package.json` scripts:

```json
{
  "start": "vite --config vite.config.docs.js",
  "build:dist": "rimraf ./dist && vite build --config vite.config.dist.js",
  "build:docs": "rimraf ./examples/dist && vite build --config vite.config.docs.js"
}
```

### 4. CSS Import Syntax

Updated `examples/index.css`:

- Changed `@import "~normalize.css"` to `@import "normalize.css"`
- Changed `@import "~prismjs/themes/prism.css"` to `@import "prismjs/themes/prism.css"`

Vite resolves node_modules imports in CSS automatically without the `~` prefix.

### 5. TypeScript Support

Vite handles TypeScript natively using esbuild, so:

- No need for `ts-loader` or `babel-loader` with TypeScript preset
- TypeScript compilation still handled by `tsc` for library output (`lib/`)
- Vite builds from the compiled `lib/` directory

## Build Process

1. **TypeScript Compilation** (`build:ts`): Compiles TypeScript source to JavaScript in `lib/`
2. **Library Build** (`build:dist`): Bundles `lib/core.js` to `dist/editable.js` as UMD library
3. **Examples Build** (`build:docs`): Bundles examples to `examples/dist/` for documentation

## Key Differences from Webpack

1. **Faster Builds**: Vite uses esbuild for transpilation (much faster than Babel)
2. **Native ES Modules**: Vite uses native ES modules in development
3. **Simpler Configuration**: Less configuration needed
4. **CSS Handling**: CSS imports work natively, no special loaders needed
5. **No Babel**: Vite uses esbuild for TypeScript/JSX, eliminating need for Babel

## Testing

Karma tests are still using the existing setup. The build output should be compatible.

## Next Steps (Optional)

- Consider migrating Karma tests to Vitest for better Vite integration
- Consider adding `"type": "module"` to package.json if migrating fully to ES modules
