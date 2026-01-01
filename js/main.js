// 這裡放你的互動（之後可加：購物車、折扣公告、語言切換等）
document.querySelectorAll('.nav-pill').forEach(a=>{
  a.addEventListener('click', ()=>{
    document.querySelectorAll('.nav-pill').forEach(x=>x.classList.remove('is-active'));
    a.classList.add('is-active');
  });
});
