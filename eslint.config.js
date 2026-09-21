import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';
import hooks from 'eslint-plugin-react-hooks';
export default ts.config({ignores:['.local/**','**/target/**','**/dist/**','**/node_modules/**','**/gen/**','test-results/**','playwright-report/**']},js.configs.recommended,...ts.configs.recommended,{files:['**/*.{ts,tsx,js,mjs,cjs}'],languageOptions:{globals:{...globals.browser,...globals.node}},plugins:{'react-hooks':hooks},rules:{...hooks.configs.recommended.rules,'@typescript-eslint/no-require-imports':'off','@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}});
