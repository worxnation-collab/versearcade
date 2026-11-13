// church-stub-tour — the SIGNED-IN church surfaces (church tab, Play tab's
// church step, the Church Office) driven at 390px against a stub backend whose
// answers were captured from the real demo church's RPCs (2026-11-13). The
// church tab is online-only, so nothing else shows it without an account.
//   VITE_SUPABASE_URL=https://stubproj.supabase.co VITE_SUPABASE_ANON_KEY=stubkey npx vite build --outDir /tmp/dist-stub
//   npx vite preview --outDir /tmp/dist-stub --port 4182 &
//   PW=<chromium> node scripts/church-stub-tour.mjs /church /play /church/<id>/admin
// Screenshots land in $OUT (default /tmp/church-tour). Missing RPCs are listed.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'
const PORT=4182, O=process.env.OUT ?? '/tmp/church-tour'
const UID='d78abf8f-9a20-4bbe-a415-e99da3e83713', CH='f1b2cec8-5a2b-4ca7-824e-8399092ed325'
const b64=(o)=>Buffer.from(JSON.stringify(o)).toString('base64url')
const jwt=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:UID,role:'authenticated',exp:4102444800,aud:'authenticated'})}.sig`
const user={id:UID,aud:'authenticated',role:'authenticated',email:'a@example.com',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}
const session={access_token:jwt,refresh_token:'r',token_type:'bearer',expires_in:3600,expires_at:4102444800,user}
const avatar={hair:'espresso',robe:'linen',skin:'ebony',armor:{},figure:'masc',outfit:{hair:{id:'hair_short',color:'#1E1410'},top:{id:'top_tshirt',color:'#4F8FD6'},legs:{id:'legs_jeans',color:'#2A3F7A'},shoes:{id:'shoes_sneakers',color:'#F2ECE0'}}}
const profile={id:UID,username:'applereview',display_name:null,avatar_emoji:'📖',avatar_character:avatar,xp:900,level:3,current_streak:6,longest_streak:6,streak_freezes:1,last_played_on:'2026-11-12',total_plays:7,sound_enabled:false,haptics_enabled:false,reduce_motion:true,onboarded:true,denomination:'non_denominational',church_id:CH}
const church={id:CH,xp:0,lat:0,lng:0,city:'Springfield',name:'Verse Arcade Demo Church',skin:null,level:1,region:'IL',address:null,members:4}
const members=[{pet:null,is_me:true,username:'applereview',avatar_emoji:'📖',avatar_character:avatar},{pet:null,is_me:false,username:'qa_leader',avatar_emoji:'📖',avatar_character:null},{pet:null,is_me:false,username:'qa_member1',avatar_emoji:'📖',avatar_character:null},{pet:null,is_me:false,username:'qa_member2',avatar_emoji:'📖',avatar_character:null}]
const ann={id:'a1',message:'Potluck after the 10:30 service on Sunday. Bring a dish to share.',created_at:'2026-10-22T15:47:21Z',expires_at:null}
const qs=[{teach:'This verse is Psalm 91:1, from the book of Psalms.',prompt:'Which book of the Bible is this verse from?',options:['2 Kings','2 Peter','Psalms','Matthew'],answerIndex:2},{teach:'Here the words come from The psalmist.',prompt:'Who is speaking in this verse?',options:['The apostle Paul','The psalmist','Jahaziel','The bride'],answerIndex:1},{teach:'The missing word is "shelter."',prompt:'Fill the blank: "He who dwells in the _____ of the Most High will abide in the shadow of the Almighty."',options:['remembrance','joyful','shelter','husbands'],answerIndex:2}]
const day=(d,ref,series,status='approved')=>({note:null,text:'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.',series,status,drop_date:d,generated:false,questions:qs,reference:ref,visibility:'congregation'})
const R={
 get_my_church:{church,givers:[],my_given:0,available:296},
 church_extras:{ok:true,is_admin:true,logo_url:null,verified:true,is_member:true,giving_url:null,announcement:ann},
 get_church_page:{ok:true,info:{about:'A sample congregation.',contact:null,tagline:'A demo congregation for trying the church features',website:null,thisWeek:'This week we are reading Psalms together.',serviceTimes:'Sundays 9:00 and 10:30'},church:{...church,miles:0,is_mine:true},members,can_edit:true,member_total:4,my_request_pending:false},
 church_leaderboard:{me:{...church,rank:1,points:0,miles:0,is_mine:true},rows:[{...church,rank:1,points:0,miles:0,is_mine:true},{...church,id:'x2',name:'Grace Fellowship',city:'Chatham',level:4,xp:5200,points:120,rank:2,is_mine:false,members:9}],scope:'radius',since:'2026-11-09T00:00:00Z',total:2,window:'week',radius_miles:30},
 my_church_yard:{given:0,plantings:{}},
 church_leader_look:{hair:'espresso',look:'classic-clergy',skin:'sand',figure:'masc',art_url:null},
 my_church_series:{days:['07','08','09','10','11','12','13'].map((d,i)=>({date:`2026-11-${d}`,today:d==='13',played:i<4,reference:'Psalm 23:1'})),today:'2026-11-13',series:'Psalms for the Week',church_id:CH,church_name:'Verse Arcade Demo Church'},
 church_week_summary:{ok:true,floor:5,members:4,verse_days:5,week_start:'2026-11-09T00:00:00Z',drop_players:null,verse_players:null},
 church_feed:{ok:true,events:[]},
 my_church_verse:{note:'Read the whole psalm before Sunday.',text:'He who dwells in the shelter of the Most High will abide in the shadow of the Almighty.',played:null,series:'Psalms for the Week',church_id:CH,drop_date:'2026-11-13',questions:qs,reference:'Psalm 91:1',church_name:'Verse Arcade Demo Church',series_progress:{total:7,played:4,so_far:7}},
 my_church_today:{verified:true,church_id:CH,giving_url:null,church_name:'Verse Arcade Demo Church',announcements:[ann]},
 my_church_assets:[], my_church_check_ins:{notes:[],unseen:0},
 my_led_churches:[{id:CH,name:'Verse Arcade Demo Church',verified:true},{id:'af9e',name:'Verse Arcade Demo Chapel',verified:false}],
 my_church_group:null,
 church_leader_insights:{ok:true,days:Array.from({length:14},(_,i)=>({date:`2026-10-${31+i>31?'':''}`,drop:i%3,church:i%2,scheduled:true})).map((d,i)=>({...d,date:new Date(Date.UTC(2026,9,31+i)).toISOString().slice(0,10)})),quiet:2,today:'2026-11-13',notice:ann,roster:[{leader:true,streak:6,drop_7d:5,username:'applereview',church_7d:4,joined_at:'2026-10-24T00:00:00Z',church_avg:180,avatar_emoji:'📖',last_played_on:'2026-11-12',avatar_character:avatar},{leader:true,streak:0,drop_7d:0,username:'qa_leader',church_7d:0,joined_at:null,church_avg:null,avatar_emoji:'📖',last_played_on:null,avatar_character:null},{leader:false,streak:3,drop_7d:3,username:'qa_member1',church_7d:2,joined_at:null,church_avg:192,avatar_emoji:'📖',last_played_on:'2026-11-13',avatar_character:null},{leader:false,streak:0,drop_7d:0,username:'qa_member2',church_7d:0,joined_at:null,church_avg:null,avatar_emoji:'📖',last_played_on:'2026-10-20',avatar_character:null}],series:[{days:7,ends:'2026-11-13',plays:6,series:'Psalms for the Week',so_far:7,starts:'2026-11-07',players:2,completion:40}],members:4,streaks:{s0:2,s1:0,s7:0,s2_6:2},active_7d:2},
 church_entitlements:{ok:true,leader_look:'classic-clergy',church_leader:true,custom_art_url:null,content_generation:false,custom_leader_avatar:false,content_generation_held:false,custom_leader_avatar_held:false},
 church_verses_range:{ok:true,days:[day('2026-11-13','Psalm 91:1','Psalms for the Week','published'),day('2026-11-14','Matthew 5:14','The Sermon on the Mount'),day('2026-11-15','Matthew 6:33','The Sermon on the Mount')]},
 church_leader_summary:{ok:true,today:'2026-11-13',notice:ann,members:4,verified:true,active_7d:2,active_pct:50,avg_streak:2.2},
 church_autopilot:{ok:false,reason:'no_addon'}, church_join_inquiry_list:{ok:true,inquiries:[]},
 church_series_landing:{ok:true,today:'2026-11-13',series:[{days:7,name:'Psalms for the Week',status:'running',engaged:2,end_date:'2026-11-13',completed:1,live_days:7,start_date:'2026-11-07',engaged_pct:50,completed_pct:25}],members:4},
 church_auto_weeks:{ok:true,jobs:[]}, church_digest_setting:{ok:true,enabled:false,has_email:true}, church_groups_list:{ok:true,groups:[]}, church_prayer_list:{ok:true,notes:[]},
 church_leaders:{ok:true,leaders:[{is_me:true,member:true,username:'applereview',granted_at:'2026-10-31T00:00:00Z',granted_by:'sharkbait',apple_payer:false,avatar_emoji:'📖',avatar_character:avatar}]},
 my_church_billing:{ok:true,addon:false,apple:null,status:'active',interval:'year',period_end:'2027-10-22T00:00:00Z',subscribed:true,collection_method:'send_invoice'},
 church_admin_settings:{ok:true,name:'Verse Arcade Demo Church',verified:true,giving_url:null,announcement:ann},
 church_self_claim_status:{ok:true,status:'you_lead',free_ok:false,members:4,my_pending:null},
 church_rivalry:null,
 church_verse_for:{ok:true,verse:day('2026-11-13','Psalm 91:1','Psalms for the Week','published')},
}
// Populated states (the demo church is empty in these) — so the tour checks
// what a church with people in it sees, not only the empty cards.
const ppl=(u,c)=>({username:u,avatar_emoji:'📖',avatar_character:c??null})
R.church_join_inquiry_list={ok:true,inquiries:[{...ppl('grace_t'),note:'We just moved to Springfield. What time is the family service, and is there anything for kids?',at:'2026-11-12T18:20:00Z',joined_here:false,joined_elsewhere:false,reply:null,replied_at:null}]}
R.church_groups_list={ok:true,groups:[{id:'g1',name:'Tuesday Young Adults',description:'Meets at the Hendersons\' after work',members:[{...ppl('applereview',avatar),role:'leader',is_me:true},{...ppl('qa_member1'),role:'member'},{...ppl('grace_t'),role:'member'}]},{id:'g2',name:'Men\'s breakfast',description:null,members:[{...ppl('qa_leader'),role:'leader'}]}]}
R.church_prayer_list={ok:true,notes:[{id:'p1',category:'health',line:'My mum has surgery on Thursday morning.',created_at:'2026-11-12T09:00:00Z',state:'open',answered_at:null,...ppl('qa_member1'),prayed:false,followed_up:false},{id:'p2',category:'work',line:'Interview on Friday — pray for peace.',created_at:'2026-11-08T09:00:00Z',state:'answered',answered_at:'2026-11-11T09:00:00Z',...ppl('qa_member2'),prayed:true,followed_up:false}]}
R.church_leader_insights.roster.push(...['jonah_r','ruthie','mk_ellis','sam_okafor','dee'].map((u,i)=>({leader:false,streak:i,drop_7d:i,username:u,church_7d:i%3,joined_at:'2026-11-0'+(i+1)+'T00:00:00Z',church_avg:150+i*10,avatar_emoji:'📖',last_played_on:i>1?'2026-11-1'+i:'2026-10-2'+i,avatar_character:null})))

const routes=process.argv.slice(2)
mkdirSync(O,{recursive:true})
const b=await chromium.launch({executablePath:process.env.PW})
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true})
await ctx.addInitScript(([s])=>{localStorage.setItem('sb-stubproj-auth-token',JSON.stringify(s));localStorage.setItem('va.settings',JSON.stringify({state:{tutorialSeen:true,soundEnabled:false,musicEnabled:false,reduceMotion:true,tipsSeen:['play','battle','study','church','you'],firstDropTourSeen:true,churchMomentSeen:true},version:0}))},[session])
const miss=new Set()
await ctx.route('https://stubproj.supabase.co/**',async(route)=>{const u=new URL(route.request().url());let body='null'
 if(u.pathname.endsWith('/rest/v1/profiles'))body=JSON.stringify(u.search.includes('single')||route.request().headers()['accept']?.includes('vnd.pgrst.object')?profile:[profile])
 else if(u.pathname.startsWith('/auth/v1/user'))body=JSON.stringify(user)
 else if(u.pathname.includes('/rpc/')){const n=u.pathname.split('/rpc/')[1];if(n in R)body=JSON.stringify(R[n]);else miss.add(n)}
 else if(u.pathname.startsWith('/rest/v1/'))body='[]'
 await route.fulfill({status:200,contentType:'application/json',body})})
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message))
for(const [i,r] of routes.entries()){await p.goto(`http://127.0.0.1:${PORT}${r}`);await p.waitForTimeout(3000);await p.screenshot({path:`${O}/s${i}_${r.replace(/\W+/g,'_')}.png`,fullPage:true});console.log(r,await p.evaluate(()=>document.documentElement.scrollHeight))
 // On the Church Office, every tab too ("Home" is the first shot)
 if(r.endsWith('/admin'))for(const t of ['Plan','People','Your page']){const b=p.getByText(t,{exact:true}).first();if(await b.count()){await b.click();await p.waitForTimeout(1800);await p.screenshot({path:`${O}/s${i}_tab_${t.replace(/\W+/g,'_')}.png`,fullPage:true});console.log(' tab',t,await p.evaluate(()=>document.documentElement.scrollHeight))}else console.log(' no tab',t)}}
console.log('missing rpcs',[...miss].join(','));console.log('errors',errs)
await b.close()
