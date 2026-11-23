import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {act,cleanup,renderHook,waitFor} from '@testing-library/react';
import type {ReactNode} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {Actor} from '../api';
import {useAttendanceControl,type AuxSnapshot} from '../attendanceApi';

const mock=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../api',()=>({api:mock,errorText:()=> 'Transition rejected'}));
const actor={userId:'employee',role:'MODERATOR'} as Actor;
const snapshot:AuxSnapshot={state:'NON_MODERATING',startedAt:new Date(Date.now()-100000).toISOString(),serverTime:new Date().toISOString(),attendanceSessionId:'test',version:0,canTransition:true,lockReason:null,presence:'ONLINE'};
let reading:AuxSnapshot;
beforeEach(()=>{
 reading={...snapshot};
 mock.get.mockReset().mockImplementation(async()=>({data:reading}));
 mock.post.mockReset().mockImplementation(async()=>({data:reading}));
});
afterEach(cleanup);
function hook(){
 const client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});
 return renderHook(()=>useAttendanceControl(actor),{wrapper:({children}:{children:ReactNode})=><QueryClientProvider client={client}>{children}</QueryClientProvider>});
}
it('uses the server interval start and waits for the authoritative punch result',async()=>{
 const {result}=hook();
 await waitFor(()=>expect(result.current.state.available).toBe(true));
 if(result.current.state.available)expect(result.current.state.elapsedSeconds).toBeGreaterThan(90);
 const stale=reading;
 mock.post.mockImplementation(async(path,payload)=>{
  if(path==='/aux/transition'){
   expect(payload).toEqual({state:'BREAK',attendanceSessionId:'test',version:0});
   reading={...stale,state:'BREAK',version:1,startedAt:stale.serverTime};
  }
  return {data:reading};
 });
 act(()=>result.current.punch('BREAK'));
 await waitFor(()=>expect(result.current.state).toMatchObject({available:true,status:'BREAK'}));
});
it('keeps the previous punch after rejection and disables transitions on disconnected data',async()=>{
 const {result}=hook();
 await waitFor(()=>expect(result.current.state.available).toBe(true));
 mock.post.mockRejectedValueOnce(new Error('stale version'));
 act(()=>result.current.punch('BREAK'));
 await waitFor(()=>expect(result.current.state).toMatchObject({status:'NON_MODERATING',error:'Transition rejected'}));
 reading={...snapshot,presence:'DISCONNECTED',canTransition:false};
 const other=hook();
 await waitFor(()=>expect(other.result.current.state).toMatchObject({available:true,disabled:true,error:'Connection interrupted. Reconnecting…'}));
});

