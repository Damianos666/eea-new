import { useT } from "../lib/LangContext";
import { C } from "../lib/constants";

const S = C.greyMid; // stroke nieaktywny
const A = C.black;   // stroke aktywny

function IconSzkolenia({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="14" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="12" y1="4" x2="12" y2="18" stroke={c} strokeWidth="1.5"/>
      <line x1="5.5" y1="8.5" x2="10" y2="8.5" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="5.5" y1="11.5" x2="10" y2="11.5" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13.5" y1="8.5" x2="18.5" y2="8.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13.5" y1="11.5" x2="18.5" y2="11.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 18 L10.5 21.5 L12 20.2 L13.5 21.5 Z" fill={c}/>
    </svg>
  );
}

function IconKatalog({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7.5" height="7.5" rx="1" stroke={c} strokeWidth="1.5"/>
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1" stroke={c} strokeWidth="1.5"/>
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1" stroke={c} strokeWidth="1.5"/>
      <circle cx="17.5" cy="17.5" r="3.5" stroke={c} strokeWidth="1.5"/>
      <line x1="20" y1="20" x2="22" y2="22" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconTerminarz({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="17" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke={c} strokeWidth="1.5"/>
      <line x1="8" y1="2" x2="8" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="16" y1="2" x2="16" y2="6" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <polyline points="8,14 11,17 16,12" stroke={active ? C.green : S} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconWiadomosci({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M3 5.5C3 4.67 3.67 4 4.5 4H19.5C20.33 4 21 4.67 21 5.5V15C21 15.83 20.33 16.5 19.5 16.5H8L4 20.5V16.5H4.5C3.67 16.5 3 15.83 3 15V5.5Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="7" y1="9" x2="17" y2="9" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="12.5" x2="13" y2="12.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconProfil({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke={c} strokeWidth="1.5"/>
      <path d="M4 20C4 16.686 7.582 14 12 14C16.418 14 20 16.686 20 20" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconKody({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="7" y="3" width="10" height="14" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="10" y1="7" x2="14" y2="7" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="10" x2="14" y2="10" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="13" x2="12" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M5 7H4C3.45 7 3 7.45 3 8V20C3 20.55 3.45 21 4 21H16C16.55 21 17 20.55 17 20V19" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconQuiz({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={c} strokeWidth="1.5"/>
      <path d="M9.5 9.5C9.5 8.12 10.62 7 12 7C13.38 7 14.5 8.12 14.5 9.5C14.5 10.88 12 12.5 12 12.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="12" cy="15.5" r="0.8" fill={active ? C.green : S}/>
    </svg>
  );
}

function IconEdytor({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M14 3H6C5.45 3 5 3.45 5 4V20C5 20.55 5.45 21 6 21H18C18.55 21 19 20.55 19 20V8L14 3Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <polyline points="14,3 14,8 19,8" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="8" y1="13" x2="16" y2="13" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="17" x2="13" y2="17" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconUzytkownicy({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="9" cy="8" r="3.5" stroke={c} strokeWidth="1.5"/>
      <path d="M2 20C2 16.686 5.134 14 9 14C12.866 14 16 16.686 16 20" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="18" cy="8" r="2.5" stroke={c} strokeWidth="1.5"/>
      <path d="M16 14C17.6 14.4 19 15.6 20 17" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconZgloszenia({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke={c} strokeWidth="1.5"/>
      <circle cx="8" cy="14" r="2" stroke={active ? C.green : S} strokeWidth="1.5"/>
      <line x1="12" y1="13" x2="18" y2="13" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="12" y1="16" x2="16" y2="16" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function IconRejestracje({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke={c} strokeWidth="1.5"/>
      <line x1="8" y1="14" x2="11" y2="14" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="8" y1="17" x2="11" y2="17" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <polyline points="13,13 15.5,16 19,12" stroke={active ? C.green : S} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function IconWidokKlienta({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <path d="M12 5C7 5 3 12 3 12C3 12 7 19 12 19C17 19 21 12 21 12C21 12 17 5 12 5Z" stroke={c} strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="12" cy="12" r="3" stroke={active ? C.green : S} strokeWidth="1.5"/>
    </svg>
  );
}

function IconRozliczenia({ active }) {
  const c = active ? A : S;
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="4" width="18" height="16" rx="1.5" stroke={c} strokeWidth="1.5"/>
      <line x1="3" y1="9" x2="21" y2="9" stroke={c} strokeWidth="1.5"/>
      <line x1="7" y1="13" x2="11" y2="13" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="16" x2="9" y2="16" stroke={active ? C.green : S} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="12.5" x2="18" y2="12.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="13" y1="15.5" x2="16" y2="15.5" stroke={c} strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="6.5" x2="10" y2="6.5" stroke={c} strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  );
}

export const TAB_ICONS_CLIENT = [IconSzkolenia, IconKatalog, IconTerminarz, IconWiadomosci, IconProfil];
export const TAB_ICONS_TRAINER = [IconTerminarz, IconKody, IconWiadomosci, IconQuiz, IconProfil];
export const TAB_ICONS_ADMIN_DESKTOP = [IconTerminarz, IconWidokKlienta, IconWiadomosci, IconEdytor, IconUzytkownicy, IconZgloszenia, IconRejestracje, IconRozliczenia];
export const TAB_ICONS_ADMIN_MOBILE  = [IconTerminarz, IconWiadomosci, IconUzytkownicy, IconZgloszenia];

export function TabBar({ tab, setTab, completedCount, msgCount }) {
  const T = useT();
  const labels = [T.tab_trainings, T.tab_catalog, T.tab_schedule, T.tab_messages, T.tab_profile];
  return (
    <div className="tabbar" style={{display:"flex",background:C.white,borderTop:`1px solid ${C.grey}`,flexShrink:0}}>
      {TAB_ICONS_CLIENT.map((Icon, i) => (
        <button key={i} onClick={() => setTab(i)}
          style={{flex:1,background:"none",border:"none",borderTop:`3px solid ${tab===i ? C.green : "transparent"}`,padding:"8px 2px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer",position:"relative"}}>
          {i===0 && completedCount>0 && <div style={{position:"absolute",top:4,right:"calc(50% - 16px)",background:C.green,color:C.white,borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{completedCount}</div>}
          {i===3 && msgCount>0 && <div style={{position:"absolute",top:4,right:"calc(50% - 16px)",background:"#E74C3C",color:C.white,borderRadius:"50%",width:15,height:15,fontSize:8,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center"}}>{msgCount}</div>}
          <Icon active={tab===i}/>
          <span style={{fontSize:10,fontWeight:600,color:tab===i ? C.black : C.greyMid,letterSpacing:.2}}>{labels[i]}</span>
        </button>
      ))}
    </div>
  );
}
