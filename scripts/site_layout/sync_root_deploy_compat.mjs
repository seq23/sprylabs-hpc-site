#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, PUBLIC_ROOT} from './lib.mjs';

const redirectsSrc = path.join(PUBLIC_ROOT, '_redirects');
const headersSrc = path.join(PUBLIC_ROOT, '_headers');
const redirectsRoot = path.join(ROOT, '_redirects');
const headersRoot = path.join(ROOT, '_headers');

const redirects = fs.existsSync(redirectsSrc) ? fs.readFileSync(redirectsSrc, 'utf8').trimEnd() : '';
const headers = fs.existsSync(headersSrc) ? fs.readFileSync(headersSrc, 'utf8').trimEnd() : '';

const marker = '# Sprylabs source-layout compatibility: serve canonical routes from site/public while Pages output remains repository root.';
const catchAll = '/* /site/public/:splat 200';
const rootRedirects = `${redirects}${redirects ? '\n\n' : ''}${marker}\n${catchAll}\n`;
fs.writeFileSync(redirectsRoot, rootRedirects);
fs.writeFileSync(headersRoot, `${headers}\n`);
console.log('[site-layout] root deploy compatibility synchronized');
