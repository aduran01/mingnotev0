import { useSnapshot } from "valtio";
import { state } from "../../lib/store";
import { doSearch } from "../../lib/ipc";


export default function Search(){
const s = useSnapshot(state);
const onSearch = async (q: string) => {
state.search.q = q;
if(!q) { state.search.results = []; return; }
const rows = await doSearch(s.projectPath, q);
state.search.results = rows.map(([id, snippet]: [string, string]) => ({id, snippet}));
};
return (
<div className="card" style={{margin:12,padding:12}}>
<input placeholder="Search…" value={s.search.q}
onChange={e=> onSearch(e.target.value)} style={{width:"100%",padding:8,borderRadius:"12px",border:"1px solid #e3e6ef"}} />
<ul>
{s.search.results.map(r=> (
<li key={r.id}><a href="#" onClick={()=> state.currentDocId=r.id} dangerouslySetInnerHTML={{__html:r.snippet}}/></li>
))}
</ul>
</div>
);
}