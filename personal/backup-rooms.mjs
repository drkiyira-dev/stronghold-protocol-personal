import path from 'node:path';
import {existsSync} from 'node:fs';
import {openRoomStore} from './room-store.mjs';
const [source,destination,...extra]=process.argv.slice(2);
if(!source||!destination||extra.length)throw new Error('Usage: node personal/backup-rooms.mjs SOURCE_DIR NEW_BACKUP_DIR (stop the room server first)');
if(!['rooms.sqlite','recovery.key'].every(file=>existsSync(path.resolve(source,file))))throw new Error('Source database or recovery key is missing; no empty replacement backup was created');
const store=openRoomStore(path.resolve(source));
try{await store.backupTo(path.resolve(destination));console.log('Room database and recovery key backed up. Keep the original server stopped when restoring this copy.');}
finally{store.close();}
