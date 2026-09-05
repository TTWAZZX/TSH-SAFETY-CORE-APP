'use strict';

require('dotenv').config({ path:require('path').join(__dirname,'..','.env') });
const db=require('../db');

(async()=>{
    const host=String(process.env.DB_HOST||'localhost').toLowerCase();
    if(!['localhost','127.0.0.1','::1'].includes(host)) throw new Error('Phase 10F-2 Local enable is restricted to a localhost database.');
    await db.query("INSERT INTO BBS_Settings(SettingKey,SettingValue) VALUES('visual_card_designer_enabled','1') ON DUPLICATE KEY UPDATE SettingValue='1'");
    await db.query("INSERT INTO BBS_Settings(SettingKey,SettingValue) VALUES('visual_card_designer_rendering_enabled','0') ON DUPLICATE KEY UPDATE SettingValue='0'");
    const [rows]=await db.query("SELECT SettingKey,SettingValue FROM BBS_Settings WHERE SettingKey IN ('visual_card_designer_enabled','visual_card_designer_rendering_enabled') ORDER BY SettingKey");
    const values=Object.fromEntries(rows.map(row=>[row.SettingKey,String(row.SettingValue)]));
    if(values.visual_card_designer_enabled!=='1'||values.visual_card_designer_rendering_enabled!=='0')throw new Error('Unable to establish the Local editor-only setting state.');
    console.log('BBS Phase 10F-2 Local setting: editor enabled; live designer rendering disabled.');
})().catch(error=>{console.error(error.message||error);process.exitCode=1;}).finally(()=>db.end());
