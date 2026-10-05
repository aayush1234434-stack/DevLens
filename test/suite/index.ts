import * as fs from 'fs';
import * as path from 'path';
import Mocha from 'mocha';

export async function run(): Promise<void> {
	const mocha = new Mocha({ ui: 'tdd', color: true });
	const testsRoot = path.resolve(__dirname);
	const files = fs.readdirSync(testsRoot).filter(file => file.endsWith('.test.js'));
	for (const file of files) {
		mocha.addFile(path.resolve(testsRoot, file));
	}

	await new Promise<void>((resolve, reject) => {
		mocha.run(failures => failures === 0 ? resolve() : reject(new Error(`${failures} test(s) failed.`)));
	});
}
