/* Portable static adaptation of the Network-Weaving Directory.
   Only entries.json is loaded; no request is made to the original site. */
(() => {
  'use strict';
  const labels = {artist:'Artists',community:'Communities',event:'Public events',map:'Maps & directories',media:'Media',organization:'Organizations',resource:'Resource banks'};
  const singular = {artist:'Artist',community:'Community',event:'Public event',map:'Map & directory',media:'Media',organization:'Organization',resource:'Resource bank'};
  const kinds = ['artist','community','event','map','media','organization','resource'];
  const $ = id => document.getElementById(id);
  const state = {entries:[],artwork:{},search:'',kind:'',country:'',state:'',region:'',sort:'image',view:'cards',page:1,mapZoom:4,mapCenter:[39,-96]};
  const pageSize = 24;
  let activeMap = null;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function link(text, href, cls) {
    const node = el('a', cls, text);
    node.href = href;
    return node;
  }
  function placeLabel(entry) {
    return [entry.city, entry.state, entry.country].filter(Boolean).join(', ');
  }
  function matches(entry) {
    if (state.kind && entry.kind !== state.kind) return false;
    if (state.country && entry.country !== state.country) return false;
    if (state.state && entry.state !== state.state) return false;
    if (state.region && entry.region !== state.region) return false;
    const q = state.search.trim().toLocaleLowerCase();
    if (!q) return true;
    return [entry.name, entry.summary, entry.city, entry.state, entry.region, entry.country, entry.neighborhood, ...entry.topics]
      .some(value => String(value || '').toLocaleLowerCase().includes(q));
  }
  function selectedEntries() {
    const items = state.entries.filter(matches);
    if (state.sort === 'az') items.sort((a,b) => a.name.localeCompare(b.name));
    else if (state.sort === 'za') items.sort((a,b) => b.name.localeCompare(a.name));
    else items.sort((a,b) => {
      const ar = Object.keys(state.artwork).indexOf(a.slug), br = Object.keys(state.artwork).indexOf(b.slug);
      if (ar >= 0 && br >= 0) return ar-br;
      if (ar >= 0) return -1;
      if (br >= 0) return 1;
      return Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || a.name.localeCompare(b.name);
    });
    return items;
  }
  function art(entry) {
    const box = el('div', `card-art ${entry.imageKind === 'logo' ? 'logo' : ''}`);
    const fallback = el('span','art-fallback',entry.name.split(/\s+/).slice(0,2).map(x => x[0]).join('').toUpperCase());
    box.append(fallback);
    const imageUrl=state.artwork[entry.slug] || entry.imageUrl;
    if (imageUrl) {
      const img = el('img');
      img.src = imageUrl;
      img.alt = `${entry.name} image`;
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('load', () => { fallback.hidden = true; });
      img.addEventListener('error', () => { img.remove(); });
      box.append(img);
    }
    return box;
  }
  function card(entry) {
    const node = el('article','card');
    node.append(art(entry));
    const body = el('div','card-body');
    body.append(el('span','kind',labels[entry.kind] || entry.kind));
    const h = el('h3'); h.append(link(entry.name, `#/directory/${encodeURIComponent(entry.slug)}`)); body.append(h);
    if (entry.summary) body.append(el('p','summary',entry.summary));
    const loc = placeLabel(entry); if (loc) body.append(el('p','meta',loc));
    body.append(link('View entry ↗', `#/directory/${encodeURIComponent(entry.slug)}`, 'view-entry'));
    node.append(body);
    return node;
  }
  function populateSelect(id, values, label) {
    const select = $(id);
    const current = state[id];
    select.replaceChildren(new Option(`All ${label}`,''));
    for (const value of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b))) {
      select.add(new Option(value,value));
    }
    select.value = current;
  }
  function renderCollections() {
    const counts = Object.fromEntries(kinds.map(kind => [kind,state.entries.filter(e=>e.kind===kind).length]));
    $('collections').replaceChildren(...kinds.map(kind => {
      const button = el('button',`collection ${state.kind===kind?'active':''}`);
      button.type='button';
      const count = el('b','',String(counts[kind]));
      button.append(count,document.createTextNode(labels[kind]));
      button.setAttribute('aria-pressed',String(state.kind===kind));
      button.addEventListener('click',()=>{state.kind=state.kind===kind?'':kind;state.page=1;$('kind').value=state.kind;render();locationToDirectory();});
      return button;
    }));
  }
  function locationToDirectory() {
    if (window.location.hash !== '#/directory') window.location.hash='#/directory';
    else $('directory').scrollIntoView({behavior:'smooth'});
  }
  function renderMap(items) {
    const geo=items.filter(e=>Number.isFinite(e.latitude)&&Number.isFinite(e.longitude));
    const wrap=el('div','map-wrap');
    const controls=el('div','map-tools');
    const chicago=el('button','', 'Zoom to Chicago');chicago.type='button';
    controls.append(chicago,el('span','',`${geo.length} of ${items.length} entries have source coordinates`));
    const canvas=el('div','map');
    canvas.setAttribute('aria-label','Interactive geographic directory map');
    const note=el('p','map-key','At high zoom, entries sharing a city-level coordinate fan out for selection. Lines point back to the recorded location; expanded positions are approximate. Other records retain source coordinates of unverified precision.');
    wrap.append(controls,canvas,note);
    requestAnimationFrame(()=>{
      if(!canvas.isConnected || !window.L)return;
      const map=L.map(canvas,{zoomControl:true,minZoom:2,maxZoom:17}).setView(state.mapCenter,state.mapZoom);
      activeMap=map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
        maxZoom:19,
        attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
      }).addTo(map);
      const markers=L.layerGroup().addTo(map);
      const groups=new Map();
      for(const entry of geo){
        const key=`${entry.latitude.toFixed(5)},${entry.longitude.toFixed(5)}`;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(entry);
      }
      const icon=(count,approx=false)=>L.divIcon({className:`directory-marker ${count>1?'cluster':''} ${approx?'approx':''}`,html:`<span>${count>1?count:''}</span>`,iconSize:[count>1?34:18,count>1?34:18]});
      function popup(entry,precision){
        const box=el('div','map-popup');
        box.append(el('strong','',entry.name));
        const loc=placeLabel(entry);if(loc)box.append(el('p','',loc));
        box.append(el('small','',precision));
        box.append(link('View profile ↗',`#/directory/${encodeURIComponent(entry.slug)}`));
        return box;
      }
      function draw(){
        markers.clearLayers();
        for(const entries of groups.values()){
          const anchor=L.latLng(entries[0].latitude,entries[0].longitude);
          if(entries.length>1 && map.getZoom()<11){
            L.marker(anchor,{icon:icon(entries.length),title:`${entries.length} entries share this source coordinate`})
              .on('click',()=>map.setView(anchor,Math.max(12,map.getZoom()+2)))
              .addTo(markers);
            continue;
          }
          entries.forEach((entry,index)=>{
            let shown=anchor;
            if(entries.length>1){
              const radians=index*2.399963229728653;
              const radius=18*Math.sqrt(index+1);
              const origin=map.latLngToLayerPoint(anchor);
              const offset=L.point(origin.x+Math.cos(radians)*radius,origin.y+Math.sin(radians)*radius);
              shown=map.layerPointToLatLng(offset);
              L.polyline([anchor,shown],{color:'#365547',weight:1,opacity:.72,dashArray:'3,4',interactive:false}).addTo(markers);
            }
            const precision=entries.length>1?'Approximate display position · recorded coordinate shared with other entries':'Source coordinate · precision unverified';
            L.marker(shown,{icon:icon(1,entries.length>1),title:entry.name})
              .bindPopup(popup(entry,precision),{maxWidth:290})
              .addTo(markers);
          });
        }
      }
      draw();
      map.on('zoomend',()=>{state.mapZoom=map.getZoom();state.mapCenter=[map.getCenter().lat,map.getCenter().lng];draw();});
      map.on('moveend',()=>{state.mapCenter=[map.getCenter().lat,map.getCenter().lng];});
      chicago.addEventListener('click',()=>map.setView([41.87556,-87.62442],12));
      map.invalidateSize();
    });
    return wrap;
  }
  function renderResults() {
    const items=selectedEntries();
    $('result-count').textContent=`${items.length} ${items.length===1?'entry':'entries'}`;
    $('clear').hidden=!(state.search||state.kind||state.country||state.state||state.region);
    if(activeMap){activeMap.remove();activeMap=null;}
    $('results').className=`results ${state.view}`;
    $('results').replaceChildren();
    $('pagination').replaceChildren();
    if (!items.length) {
      const empty=el('div','empty');empty.append(el('h3','', 'No entries match'),el('p','', 'Try a broader search or clear the current filters.'));
      $('results').append(empty);return;
    }
    if (state.view==='map') {$('results').append(renderMap(items));return;}
    const pages=Math.ceil(items.length/pageSize);
    state.page=Math.min(Math.max(1,state.page),pages);
    $('results').append(...items.slice((state.page-1)*pageSize,state.page*pageSize).map(card));
    if (pages>1) {
      const prev=el('button','', 'Previous');prev.disabled=state.page===1;
      const next=el('button','', 'Next');next.disabled=state.page===pages;
      prev.addEventListener('click',()=>{state.page--;renderResults();$('directory').scrollIntoView({behavior:'smooth'});});
      next.addEventListener('click',()=>{state.page++;renderResults();$('directory').scrollIntoView({behavior:'smooth'});});
      $('pagination').append(prev,el('span','',`Page ${state.page} of ${pages}`),next);
    }
  }
  function renderDetail(slug) {
    const entry=state.entries.find(e=>e.slug===slug);
    $('hero').hidden=true;$('directory').hidden=true;$('detail').hidden=false;
    $('detail').replaceChildren();
    if (!entry) {$('detail').append(link('← Back to directory','#/directory','back-link'),el('h1','', 'Entry not found'));return;}
    $('detail').append(link('← Directory','#/directory','back-link'));
    const heading=el('div','detail-heading');
    const headingText=el('div');headingText.append(el('p','eyebrow',singular[entry.kind]||entry.kind),el('h1','',entry.name));heading.append(headingText);
    const imageUrl=state.artwork[entry.slug] || entry.imageUrl;
    if (imageUrl) {const image=el('img','detail-art');image.src=imageUrl;image.alt=`${entry.name} image`;image.loading='lazy';image.referrerPolicy='no-referrer';image.addEventListener('error',()=>image.remove());heading.append(image);}
    $('detail').append(heading);
    if (entry.summary) $('detail').append(el('p','summary',entry.summary));
    if (entry.websiteUrl) {const site=link('Visit website ↗',entry.websiteUrl,'website');site.target='_blank';site.rel='noopener noreferrer';$('detail').append(site);}
    const fields=[['Location',placeLabel(entry)],['Neighborhood',entry.neighborhood],['Collection',labels[entry.kind]]].filter(x=>x[1]);
    if (fields.length) {const dl=el('dl','detail-meta');for(const [label,value] of fields){const div=el('div');div.append(el('dt','',label),el('dd','',value));dl.append(div);}$('detail').append(dl);}
    if (entry.topics.length) {const chips=el('div','chips');chips.append(...entry.topics.map(t=>el('span','chip',t)));$('detail').append(chips);}
    document.title=`${entry.name} — Collective Now`;
    window.scrollTo({top:0,behavior:'instant'});
  }
  function route() {
    const match=window.location.hash.match(/^#\/directory\/([^/?#]+)/);
    if (match) {document.querySelector('.nav-link').textContent='Back to directory';renderDetail(decodeURIComponent(match[1]));return;}
    $('hero').hidden=false;$('directory').hidden=false;$('detail').hidden=true;
    document.querySelector('.nav-link').textContent='Directory';
    document.title='Collective Now — Network Directory';
    if (window.location.hash==='#/directory') $('directory').scrollIntoView({behavior:'smooth'});
  }
  function render() {
    renderCollections();renderResults();route();
  }
  function setup() {
    for(const id of ['kind','country','state','region','sort']){
      $(id).addEventListener('change',event=>{state[id]=event.target.value;state.page=1;render();});
    }
    $('search').addEventListener('input',event=>{state.search=event.target.value;state.page=1;renderResults();});
    $('hero-search').addEventListener('submit',event=>{event.preventDefault();locationToDirectory();});
    $('clear').addEventListener('click',()=>{for(const id of ['search','kind','country','state','region'])state[id]='';state.page=1;$('search').value='';for(const id of ['kind','country','state','region'])$(id).value='';render();});
    document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{state.view=button.dataset.view;state.page=1;document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderResults();}));
    window.addEventListener('hashchange',route);
  }
  async function boot() {
    setup();
    $('result-count').textContent='Loading…';
    try {
      const [response, artworkResponse]=await Promise.all([fetch('./entries.json',{cache:'no-store'}),fetch('./assets/manifest.json',{cache:'no-store'})]);
      if(!response.ok)throw Error(`Data request failed (${response.status})`);
      state.entries=await response.json();
      if(artworkResponse.ok)state.artwork=await artworkResponse.json();
      populateSelect('kind',state.entries.map(e=>e.kind),'collections');
      for(const option of $('kind').options)if(option.value)option.textContent=labels[option.value]||option.value;
      populateSelect('country',state.entries.map(e=>e.country),'countries');
      populateSelect('state',state.entries.map(e=>e.state),'states');
      populateSelect('region',state.entries.map(e=>e.region),'regions');
      render();
    } catch(error) {
      $('result-count').textContent='Directory unavailable';
      $('results').replaceChildren(el('p','empty','The directory data could not be loaded. Serve this folder through a local web server or open the deployed site.'));
      console.error(error);
    }
  }
  boot();
})();
