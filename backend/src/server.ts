import {Pool} from 'pg';
import {createApp} from './app.js';
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const server=createApp(pool).listen(Number(process.env.PORT??3001),'0.0.0.0',()=>console.log('API http://localhost:3001'));
process.on('SIGTERM',()=>server.close(()=>{void pool.end();}));
