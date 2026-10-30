import { constants, copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

function run(command, args, cwd, capture = false) {
	const result = spawnSync(command, args, {
		cwd,
		stdio: capture ? 'pipe' : 'inherit',
		encoding: 'utf8',
		// Windows package-manager entrypoints are .cmd files. Commands/arguments
		// here are fixed by this script, never shell input from the caller.
		shell: process.platform === 'win32',
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(
			`${command} ${args.join(' ')} failed (${result.status ?? result.signal}).`,
		);
	}
	return result.stdout?.trim();
}

export function prepareLocalConfig(cwd) {
	const target = join(cwd, '.dev.vars');
	if (existsSync(target)) return 'Keeping existing .dev.vars.';
	const commonDir = run('git', ['rev-parse', '--git-common-dir'], cwd, true);
	const primary = join(dirname(resolve(cwd, commonDir)), '.dev.vars');
	const source = existsSync(primary) ? primary : join(cwd, '.dev.vars.example');
	try {
		copyFileSync(source, target, constants.COPYFILE_EXCL);
	} catch (error) {
		if (error.code === 'EEXIST') return 'Keeping existing .dev.vars.';
		throw error;
	}
	return source === primary
		? 'Copied .dev.vars from the primary checkout (values hidden).'
		: 'Created .dev.vars from the example; fill in credentials for live integrations.';
}

export function setup(cwd = root) {
	const [major, minor] = process.versions.node.split('.').map(Number);
	if (major < 22 || (major === 22 && minor < 12)) {
		throw new Error('Use Node >=22.12 (Node 24 recommended), then rerun setup.');
	}
	const { packageManager } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
	const expectedVersion = packageManager.replace('pnpm@', '').split('+')[0];
	let manager;
	try {
		const version = run('pnpm', ['--version'], cwd, true);
		if (version === expectedVersion) manager = ['pnpm', []];
	} catch {
		// Corepack can supply the pinned pnpm without a globally installed pnpm.
	}
	if (!manager) {
		try {
			const version = run('corepack', ['pnpm', '--version'], cwd, true);
			if (version === expectedVersion) manager = ['corepack', ['pnpm']];
		} catch {
			// Report one actionable prerequisite error below.
		}
	}
	if (!manager) {
		throw new Error(
			`Install pnpm ${expectedVersion} or enable Corepack, then rerun setup.`,
		);
	}
	const pnpm = (...args) => run(manager[0], [...manager[1], ...args], cwd);
	console.log(prepareLocalConfig(cwd));
	pnpm('install', '--frozen-lockfile', '--prod=false');
	pnpm('cf-typegen');
	pnpm('exec', 'playwright', 'install', 'chromium');
	console.log('Worktree ready. Start development with pnpm dev.');
	console.log('Local Worker state will be created independently in .wrangler/state.');
	console.log(
		'Live AI endpoints use real credentials; see README.md for mocked testing.',
	);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
	try {
		setup();
	} catch (error) {
		console.error(`Worktree setup failed: ${error.message}`);
		process.exitCode = 1;
	}
}
