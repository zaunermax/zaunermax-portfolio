import { afterEach, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareLocalConfig } from './setup-worktree.mjs';

const fixtures: string[] = [];
afterEach(() => {
	for (const directory of fixtures.splice(0))
		rmSync(directory, { recursive: true, force: true });
});

function fixture() {
	const directory = mkdtempSync(join(tmpdir(), 'portfolio setup '));
	fixtures.push(directory);
	const primary = join(directory, 'primary checkout');
	const worktree = join(directory, 'agent checkout');
	mkdirSync(primary);
	const git = (...args: string[]) =>
		execFileSync('git', ['-C', primary, ...args], { stdio: 'pipe' });
	git('init');
	git(
		'-c',
		'user.name=Setup Test',
		'-c',
		'user.email=setup@example.invalid',
		'-c',
		'commit.gpgsign=false',
		'commit',
		'--allow-empty',
		'-m',
		'fixture',
	);
	git('worktree', 'add', '--detach', worktree);
	writeFileSync(join(worktree, '.dev.vars.example'), 'OPENAI_API_KEY=\n');
	return { primary, worktree };
}

test('copies primary config into worktrees with spaces, without logging values', () => {
	const { primary, worktree } = fixture();
	writeFileSync(join(primary, '.dev.vars'), 'OPENAI_API_KEY=test-secret\n');
	expect(prepareLocalConfig(worktree)).not.toContain('test-secret');
	expect(readFileSync(join(worktree, '.dev.vars'), 'utf8')).toBe(
		'OPENAI_API_KEY=test-secret\n',
	);
});

test('preserves an existing worktree config when setup is repeated', () => {
	const { primary, worktree } = fixture();
	writeFileSync(join(primary, '.dev.vars'), 'OPENAI_API_KEY=primary\n');
	writeFileSync(join(worktree, '.dev.vars'), 'OPENAI_API_KEY=agent\n');
	prepareLocalConfig(worktree);
	prepareLocalConfig(worktree);
	expect(readFileSync(join(worktree, '.dev.vars'), 'utf8')).toBe(
		'OPENAI_API_KEY=agent\n',
	);
});

test('falls back to the example when the primary checkout has no config', () => {
	const { worktree } = fixture();
	expect(prepareLocalConfig(worktree)).toContain('fill in credentials');
	expect(readFileSync(join(worktree, '.dev.vars'), 'utf8')).toBe('OPENAI_API_KEY=\n');
});
