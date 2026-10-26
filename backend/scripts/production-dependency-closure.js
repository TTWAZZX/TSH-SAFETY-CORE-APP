'use strict';

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..');
const protectedEnvironmentFiles = new Set([
    'api/config.local.php',
    'api/account_recovery.release.php',
]);

function normalize(relative) {
    const value = String(relative || '').replace(/\\/g, '/').replace(/^\.\//, '');
    if (!value || path.posix.isAbsolute(value) || value.split('/').includes('..')) {
        throw new Error(`Unsafe production dependency path: ${relative}`);
    }
    return path.posix.normalize(value);
}

function absolute(relative) {
    return path.join(projectRoot, ...normalize(relative).split('/'));
}

function resolveDependency(owner, request) {
    const clean = String(request).split('?')[0].split('#')[0];
    return normalize(clean.startsWith('/')
        ? clean.replace(/^\/+/, '')
        : path.posix.join(path.posix.dirname(owner), clean));
}

function assertExactCase(relative) {
    let current = projectRoot;
    for (const segment of normalize(relative).split('/')) {
        const actual = fs.readdirSync(current).find(name => name === segment);
        if (!actual) throw new Error(`Missing or case-mismatched production dependency: ${relative}`);
        current = path.join(current, actual);
    }
}

function directDependencies(relative) {
    const owner = normalize(relative);
    assertExactCase(owner);
    const source = fs.readFileSync(absolute(owner), 'utf8');
    const dependencies = new Set();

    if (owner.endsWith('.php')) {
        const pattern = /\b(?:require|require_once|include|include_once)\s*(?:\(\s*)?__DIR__\s*\.\s*['"]([^'"]+)['"]/g;
        for (const match of source.matchAll(pattern)) {
            const dependency = resolveDependency(owner, `.${match[1]}`);
            if (protectedEnvironmentFiles.has(dependency)) continue;
            assertExactCase(dependency);
            dependencies.add(dependency);
        }
    } else if (/\.(?:js|mjs)$/.test(owner)) {
        const pattern = /(?:\bfrom\s*|\bimport\s*\(\s*)['"]([^'"]+)['"]/g;
        for (const match of source.matchAll(pattern)) {
            if (!match[1].startsWith('.') && !match[1].startsWith('/')) continue;
            const dependency = resolveDependency(owner, match[1]);
            assertExactCase(dependency);
            dependencies.add(dependency);
        }
        for (const match of source.matchAll(/['"]((?:\.\.\/|\.\/|\/)[^'"]+\.(?:js|mjs)(?:\?[^'"]*)?)['"]/g)) {
            const dependency = resolveDependency(owner, match[1]);
            assertExactCase(dependency);
            dependencies.add(dependency);
        }
    } else if (owner === 'index.html') {
        for (const match of source.matchAll(/(?:src|href)=['"]([^'"]+)['"]/g)) {
            if (/^(?:[a-z]+:|#|data:)/i.test(match[1])) continue;
            const dependency = resolveDependency(owner, match[1]);
            if (!/\.(?:js|mjs|css)$/.test(dependency)) continue;
            assertExactCase(dependency);
            dependencies.add(dependency);
        }
    }

    return [...dependencies].sort();
}

function expandRuntimeClosure(entries) {
    const roots = [...new Set(entries.map(normalize))];
    const visited = new Set();
    const visiting = new Set();
    const ordered = [];

    function visit(relative) {
        if (visited.has(relative)) return;
        if (visiting.has(relative)) return;
        visiting.add(relative);
        for (const dependency of directDependencies(relative)) visit(dependency);
        visiting.delete(relative);
        visited.add(relative);
        ordered.push(relative);
    }

    roots.forEach(visit);
    return ordered;
}

function missingRuntimeDependencies(entries) {
    const declared = new Set(entries.map(normalize));
    return expandRuntimeClosure(entries).filter(relative => !declared.has(relative));
}

function dependencyManifest() {
    const entrypoints = ['api/index.php', 'index.html'];
    return {
        schemaVersion: 1,
        contract: 'project-wide-production-dependency-closure-r1',
        runtime: 'php-shared-hosting-7.4-plus',
        protectedEnvironmentFiles: [...protectedEnvironmentFiles].sort(),
        entrypoints: Object.fromEntries(entrypoints.map(entry => [entry, expandRuntimeClosure([entry])])),
    };
}

module.exports = {
    projectRoot,
    protectedEnvironmentFiles,
    directDependencies,
    expandRuntimeClosure,
    missingRuntimeDependencies,
    dependencyManifest,
};
