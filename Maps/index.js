import { initCore, prepareBeforeGeneration, markStoryMessage } from './core.js';
import { installUi, mountInline, refreshInlineSoon, openRadio, openSettings, clearForcedView } from './ui.js';

function resolveTavernDocument(){
  try{const body=globalThis.$?.('body')?.[0];if(body?.ownerDocument)return body.ownerDocument}catch(_){}
  try{if(window.parent?.document?.body)return window.parent.document}catch(_){}
  return document;
}
const RDOC=resolveTavernDocument();
const RH=RDOC.defaultView||window.parent||window;


function isUserMessage(id){
  try{
    const msg=globalThis.SillyTavern?.chat?.[Number(id)];
    if(msg)return !!msg.is_user;
    const el=RDOC.querySelector(`#chat .mes[mesid="${id}"]`);
    return el?.getAttribute('is_user')==='true'||el?.getAttribute('data-message-role')==='user';
  }catch{return false}
}

(async()=>{
  try{
    await initCore();
    installUi();

    try{
      if(typeof eventOn==='function'&&typeof tavern_events!=='undefined'){
        const before=tavern_events.GENERATION_AFTER_COMMANDS;
        if(before)eventOn(before,async()=>{await prepareBeforeGeneration()});
        if(tavern_events.MESSAGE_RECEIVED)eventOn(tavern_events.MESSAGE_RECEIVED,(messageId)=>{
          if(isUserMessage(messageId))return;
          markStoryMessage(messageId);clearForcedView();setTimeout(()=>mountInline(),100);
        });
        if(tavern_events.MESSAGE_EDITED)eventOn(tavern_events.MESSAGE_EDITED,()=>refreshInlineSoon());
        if(tavern_events.MESSAGE_DELETED)eventOn(tavern_events.MESSAGE_DELETED,()=>refreshInlineSoon());
        if(tavern_events.CHAT_CHANGED)eventOn(tavern_events.CHAT_CHANGED,()=>setTimeout(mountInline,220));
      }
    }catch(e){console.warn('[MR-87] event binding',e)}

    const Obs=RH.MutationObserver||MutationObserver;
    const observer=new Obs(()=>{clearTimeout(RH.__mr87MountTimer);RH.__mr87MountTimer=setTimeout(()=>mountInline(),160)});
    const chat=RDOC.querySelector('#chat');if(chat)observer.observe(chat,{childList:true,subtree:false});

    RH.MuchiRadio={...(RH.MuchiRadio||{}),open:openRadio,openSettings,mount:mountInline,prepare:prepareBeforeGeneration};
  }catch(err){
    console.error('[MR-87] init failed',err);
    try{toastr?.error?.(`MR-87 初始化失败：${err?.message||err}`)}catch{}
  }
})();

export { openRadio, openSettings, mountInline };
export const VERSION='1.0.7';
