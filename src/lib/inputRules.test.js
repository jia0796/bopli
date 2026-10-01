import test from 'node:test';import assert from 'node:assert/strict';
import {nameWidth,nameError,assertName,amountInputAllowed} from './inputRules.js';
import {assertAmount} from './money.js';
test('14 display units boundary and trim',()=>{assert.equal(nameWidth('中文中文中文中'),14);assert.equal(nameError('中文中文中文中'),'');assert.match(nameError('中文中文中文中文'),/名稱太長/);assert.equal(nameError('12345678901234'),'');assert.match(nameError('123456789012345'),/名稱太長/);assert.equal(assertName(' Name '),'Name');});
test('grapheme emoji, flags, fullwidth and combining marks',()=>{assert.equal(nameWidth('👨‍👩‍👧‍👦🇹🇼👍🏽'),6);assert.equal(nameWidth('Ａ！中'),6);assert.equal(nameWidth('e\u0301'),1);assert.match(nameError('name\n'),/控制/);});
test('expense limit allows exactly billion but rejects keyboard or paste overflow',()=>{assert.equal(assertAmount(1e9),1e9);assert.throws(()=>assertAmount(1e9+1));assert.ok(amountInputAllowed('1000000000'));assert.equal(amountInputAllowed('1000000001'),false);assert.equal(amountInputAllowed('99999999999999999999'),false);});
