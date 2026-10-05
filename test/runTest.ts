import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
	const extensionDevelopmentPath = path.resolve(__dirname, '../..');
	const extensionTestsPath = path.resolve(__dirname, './suite/index');
	const vscodeExecutablePath = process.env.VSCODE_EXECUTABLE_PATH;

	await runTests({
		...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
		extensionDevelopmentPath,
		extensionTestsPath
	});
}

main().catch(error => {
	console.error('Extension tests failed:', error);
	process.exitCode = 1;
});
