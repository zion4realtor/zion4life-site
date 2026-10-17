import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoScore } from '../src/video-likes.js';
test('featured ranking balances new releases and real added likes', () => {
 const now = Date.parse('2026-10-16T00:00:00Z');
 assert.ok(videoScore(0,'2026-10-16',now)>videoScore(0,'2026-09-16',now));
 assert.ok(videoScore(100,'2026-09-16',now)>videoScore(0,'2026-10-16',now));
 assert.equal(videoScore(0,'2026-10-17',now),videoScore(0,'2026-10-16',now));
});
