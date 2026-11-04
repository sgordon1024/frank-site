// Add the maternal-family entry beside the existing standalone home features.
function mountFamilyCard() {
  const hero = document.querySelector('.home-page .home-hero');
  if (!hero || document.querySelector('.home-page .family-card')) return;
  const card = document.createElement('section');
  card.className = 'card family-card';
  card.style.cssText = 'margin:0 0 1.6rem;padding:1.2rem 1.3rem';
  card.setAttribute('aria-labelledby', 'family-card-title');
  card.innerHTML = `<p class="mono" style="color:var(--clay-deep)">The family tree</p>
    <h2 id="family-card-title" style="font-size:1.5rem;margin:.2rem 0">Meet Mom: Ducky</h2>
    <p>Six breed results from Ducky’s Embark report add to Frank’s maternal family story. These are his mom’s results; Frank’s own DNA percentages are not known.</p>
    <a href="./family.html" style="display:inline-block;padding:10px 0">Explore Frank’s family tree →</a>`;
  hero.insertAdjacentElement('afterend', card);
}
new MutationObserver(mountFamilyCard).observe(document.getElementById('root'), {childList:true,subtree:true});
mountFamilyCard();
