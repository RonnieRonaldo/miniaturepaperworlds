/* Paddle is loaded on demand. The Worker verifies payment before issuing a PDF link. */
(() => {
  'use strict';
  const c = JSON.parse(document.currentScript.dataset.purchase);
  const buttons = [...document.querySelectorAll('.buy-button')];
  const status = document.getElementById('checkoutStatus');
  const area = document.getElementById('downloadArea');
  const link = document.getElementById('downloadLink');
  const valid = id => typeof id === 'string' && /^txn_[a-z0-9]+$/.test(id);
  let transaction = null, checking = false, paid = false, loading = false, paddlePromise;
  const disable = () => buttons.forEach(b => { b.disabled = checking || paid || loading; });
  const message = text => { status.textContent = text; };
  const retry = document.createElement('button');
  retry.type = 'button'; retry.className = 'button secondary'; retry.hidden = true;
  retry.textContent = 'Semak pembayaran semula';
  const help = document.createElement('a'); help.href = '/ms-my/bantuan/';
  help.textContent = 'Bantuan pembayaran dan muat turun';
  const controls = document.createElement('div'); controls.append(retry,help);
  status.insertAdjacentElement('afterend',controls);
  function remember(id) {
    if (!valid(id)) return;
    transaction = id;
    try { localStorage.setItem(c.storage,id); } catch (_) {}
  }
  const page = new URL(location.href);
  const returned = ['transaction_id','transactionId','_ptxn'].map(k => page.searchParams.get(k)).find(valid);
  if (returned) remember(returned);
  else { try { const id=localStorage.getItem(c.storage); if(valid(id)) transaction=id; } catch (_) {} }
  function fail(text) {
    message(text+' Jika anda sudah membayar, jangan beli sekali lagi. Cuba semakan semula atau hubungi kami dengan resit Paddle.');
    retry.hidden = !valid(transaction);
  }
  async function claim() {
    if(checking || !valid(transaction)) return;
    const id=transaction; checking=true; retry.hidden=true; disable();
    message('Sedang menyemak pembayaran. Jangan beli sekali lagi.');
    try {
      for(let attempt=0;attempt<5;attempt++) {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),15000);
        let response,data;
        try {
          response=await fetch(c.worker+'/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({transaction_id:id}),signal:controller.signal});
          data=await response.json();
        } catch (_) {
          if(attempt===4) { fail('Perkhidmatan muat turun tidak dapat dihubungi.'); return; }
          message('Sambungan terganggu. Semakan pembayaran akan dicuba semula.');
          await new Promise(r=>setTimeout(r,3000)); continue;
        } finally { clearTimeout(timer); }
        if(response.ok && data.status==='ready') {
          if(data.product!==c.product) { fail('Pembayaran ini adalah untuk projek lain.'); return; }
          let url;try {url=new URL(data.download_url);}catch(_){fail('Pautan muat turun tidak dapat disahkan.');return;}
          if(url.origin!==c.worker || !url.pathname.startsWith('/download/')) {fail('Pautan muat turun tidak dapat disahkan.');return;}
          link.href=url.href;area.hidden=false;paid=true;
          message('Pembayaran disahkan. PDF bahasa Inggeris anda sedia untuk dimuat turun.');
          ['transaction_id','transactionId','_ptxn'].forEach(k=>page.searchParams.delete(k));
          try {history.replaceState({},'',page.pathname+page.search+page.hash);}catch(_){}
          area.scrollIntoView({behavior:'smooth',block:'center'});return;
        }
        if((response.status===409 || data.status==='pending' || response.status===429 || response.status>=500) && attempt<4) {
          message('Pengesahan pembayaran sedang diproses. Semakan akan dibuat semula; jangan beli sekali lagi.');
          await new Promise(r=>setTimeout(r,3000));continue;
        }
        fail('Pembayaran belum dapat disahkan.');return;
      }
    }catch(_){fail('Muat turun belum dapat disediakan.');}
    finally{checking=false;disable();}
  }
  retry.addEventListener('click',claim);
  function loadPaddle() {
    if(paddlePromise) return paddlePromise;
    paddlePromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='https://cdn.paddle.com/paddle/v2/paddle.js';script.async=true;
      const timer=setTimeout(()=>reject(new Error('timeout')),20000);
      script.onerror=()=>{clearTimeout(timer);reject(new Error('load'));};
      script.onload=()=>{
        clearTimeout(timer);
        try {
          window.Paddle.Initialize({token:c.token,eventCallback(event){
            const d=event.data||{};const id=d.transaction_id||d.transactionId||d.transaction?.id;
            if(valid(id)) remember(id);
            if(event.name==='checkout.completed') {
              paid=true;disable();
              if(valid(transaction)) claim();else fail('Pembayaran selesai tetapi rujukan muat turun tidak diterima.');
            }
          }});
          resolve();
        }catch(error){reject(error);}
      };
      document.head.append(script);
    });
    return paddlePromise;
  }
  buttons.forEach(button=>button.addEventListener('click',async()=>{
    if(checking||paid||loading)return;
    loading=true;disable();message('Membuka pembayaran selamat dalam bahasa Inggeris…');
    try{
      await loadPaddle();
      window.Paddle.Checkout.open({items:[{priceId:c.price,quantity:1}],settings:{locale:'en'}});
      message('Selepas pembayaran disahkan, pautan PDF akan muncul di sini.');
    }catch(_){fail('Pembayaran tidak dapat dibuka. Muat semula halaman untuk mencuba lagi.');}
    finally{loading=false;disable();}
  }));
  if(transaction)claim();
})();
