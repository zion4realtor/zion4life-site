import test from 'node:test';
import assert from 'node:assert/strict';
import { layout, zoomMeetingLink } from '../src/mail.js';
test('Zoom email buttons preserve meeting ID, embedded passcode and original parameters', () => {
  const url='https://us02web.zoom.us/j/12345678901?pwd=Abc%2BDef%3D&omn=123';
  assert.equal(zoomMeetingLink(`Zoom会议：${url}。会议号：123`),url);
  assert.equal(zoomMeetingLink(`Join (${url}).`),url);
  assert.equal(zoomMeetingLink('https://company.zoom.us/my/host'), 'https://company.zoom.us/my/host');
  for(const bad of ['https://zoom.us.evil.test/j/123','https://evilzoom.us/j/123','https://zoom.us@evil.test/j/123','javascript:alert(1)','https://zoom.us/profile'])assert.equal(zoomMeetingLink(bad),null);
  const result=layout({lang:'en',title:'Reminder',lines:[`Where: Zoom (${url})`,'<img src=x onerror=alert(1)>'],button:{label:'Join Zoom meeting',url},secondaryButton:{label:'Open reading',url:'https://www.zion4life.faith/en/g/example/1'}});
  assert.match(result.html,/href="https:\/\/us02web\.zoom\.us\/j\/12345678901\?pwd=Abc%2BDef%3D&amp;omn=123"/);
  assert.ok(result.text.includes(url));assert.ok(result.html.includes('Open reading'));assert.ok(!result.html.includes('<img src=x'));
});
