import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, '.github/assets');
const mark = (await fs.readFile(path.join(root, 'extension/icons/mark.svg'), 'utf8'))
  .replace(/<svg[^>]*>/, '').replace('</svg>', '').trim();

// An illustrative composition with the original product icon. No user data or remote assets.
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="640" viewBox="0 0 1280 640" role="img" aria-labelledby="title desc">
  <title id="title">CanalNonGrato — Seu feed, suas regras.</title>
  <desc id="desc">Ícone terracota do CanalNonGrato, prévia ilustrativa do YouTube e uma lista local com um canal bloqueado.</desc>
  <defs>
    <linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101820"/><stop offset="1" stop-color="#19212a"/></linearGradient>
    <radialGradient id="warm"><stop stop-color="#e98b70" stop-opacity=".16"/><stop offset="1" stop-color="#e98b70" stop-opacity="0"/></radialGradient>
    <linearGradient id="landscape" x2="0" y2="1"><stop stop-color="#93b0ba"/><stop offset="1" stop-color="#698a93"/></linearGradient>
    <linearGradient id="sea" x2="1" y2="1"><stop stop-color="#527778"/><stop offset="1" stop-color="#264b56"/></linearGradient>
    <clipPath id="mountain-clip"><rect x="714" y="208" width="126" height="82" rx="9"/></clipPath>
    <clipPath id="sea-clip"><rect x="714" y="310" width="126" height="82" rx="9"/></clipPath>
    <filter id="shadow" x="-25%" y="-25%" width="150%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="18" flood-color="#000" flood-opacity=".22"/></filter>
    <g id="ban" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10" cy="10" r="8"/><path d="m4.3 15.7 11.4-11.4"/></g>
  </defs>
  <rect width="1280" height="640" rx="28" fill="url(#bg)"/>
  <ellipse cx="1060" cy="240" rx="400" ry="370" fill="url(#warm)"/>
  <rect x=".5" y=".5" width="1279" height="639" rx="27.5" fill="none" stroke="#fff" stroke-opacity=".10"/>
  <g transform="translate(56 52) scale(.52)">${mark}</g>
  <g font-family="Arial,Helvetica,sans-serif">
    <text x="140" y="85" fill="#f2f0eb" font-size="31" font-weight="700" letter-spacing="-1">Canal<tspan fill="#e98b70">NonGrato</tspan></text>
    <text x="142" y="110" fill="#9aa8b5" font-size="10" letter-spacing="2.4">UMA EXTENSÃO ALLM4</text>

    <path d="M58 177h26" stroke="#e98b70"/>
    <text x="96" y="181" fill="#9aa8b5" font-size="10" letter-spacing="1.8">MENOS RUÍDO NO SEU YOUTUBE</text>
    <text x="54" y="270" fill="#f2f0eb" font-size="78" font-weight="700" letter-spacing="-4">Seu feed.</text>
    <text x="54" y="354" fill="#e98b70" font-family="Georgia,Times New Roman,serif" font-size="82" font-style="italic" letter-spacing="-4">Suas regras.</text>
    <text x="58" y="416" fill="#b3bfc9" font-size="21">Bloqueie canais indesejados no YouTube.</text>
    <text x="58" y="449" fill="#b3bfc9" font-size="21">Abra espaço para o que você gosta.</text>
    <rect x="58" y="492" width="241" height="43" rx="21.5" fill="#e98b70"/>
    <g transform="translate(73 504)" color="#17212c"><use href="#ban"/></g>
    <text x="106" y="519" fill="#17212c" font-size="14" font-weight="700">Um clique para bloquear</text>
    <text x="58" y="582" fill="#8f9fac" font-size="14">Gratuito · Edge e Chrome · Computador</text>

    <g filter="url(#shadow)">
      <rect x="688" y="69" width="536" height="413" rx="18" fill="#111a22" stroke="#41505e"/>
      <path d="M706 69h500a18 18 0 0 1 18 18v19H688V87a18 18 0 0 1 18-18Z" fill="#202b36"/>
      <circle cx="708" cy="87" r="3" fill="#df947c"/><circle cx="721" cy="87" r="3" fill="#71818e"/><circle cx="734" cy="87" r="3" fill="#8d9da9"/>
      <rect x="797" y="77" width="300" height="20" rx="5" fill="#121d27"/>
      <text x="947" y="91" fill="#8e9eab" font-size="9" text-anchor="middle">youtube.com</text>
      <text x="714" y="144" fill="#f2f0eb" font-size="22" font-weight="700" letter-spacing="-.6">Mais do que você gosta.</text>
      <text x="714" y="166" fill="#8699a8" font-size="10" letter-spacing="1.4">DEMONSTRAÇÃO ILUSTRATIVA</text>

      <g clip-path="url(#mountain-clip)">
        <rect x="714" y="208" width="126" height="82" fill="url(#landscape)"/>
        <circle cx="807" cy="229" r="14" fill="#efd0b5"/>
        <path d="m714 253 37-19 38 32 36-20 30 17v42H714Z" fill="#527480"/>
        <path d="m706 281 44-18 32 12 35-17 32 18v25H706Z" fill="#264b58"/>
      </g>
      <text x="855" y="232" fill="#e4e8e9" font-size="14" font-weight="600">Uma pausa pelo caminho</text>
      <text x="855" y="253" fill="#91a2af" font-size="11">Horizontes · Um canal que você escolheu</text>
      <rect x="855" y="265" width="87" height="24" rx="12" fill="#ffffff10"/>
      <g transform="translate(862 269) scale(.75)" color="#adb9c4"><use href="#ban"/></g>
      <text x="884" y="281" fill="#c2ccd3" font-size="10">Bloquear</text>

      <g clip-path="url(#sea-clip)">
        <rect x="714" y="310" width="126" height="82" fill="url(#sea)"/>
        <path d="M699 348q21-14 42 0t42 0 42 0 42 0M699 365q21-14 42 0t42 0 42 0 42 0" fill="none" stroke="#9cc4b9" stroke-opacity=".36" stroke-width="2"/>
        <path d="M699 382q21-14 42 0t42 0 42 0 42 0" fill="none" stroke="#9cc4b9" stroke-opacity=".25" stroke-width="2"/>
      </g>
      <text x="855" y="334" fill="#e4e8e9" font-size="14" font-weight="600">Um novo olhar para o seu dia</text>
      <text x="855" y="355" fill="#91a2af" font-size="11">Seu próximo favorito</text>
      <rect x="714" y="418" width="252" height="38" rx="9" fill="#243b32" stroke="#9dbda9" stroke-opacity=".22"/>
      <path d="m729 437 4 4 8-9" fill="none" stroke="#b5d2bd" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="752" y="442" fill="#deeadf" font-size="12">Canal bloqueado.</text>
      <text x="942" y="442" fill="#e9a18b" font-size="10" text-anchor="end">Desfazer</text>
    </g>

    <g filter="url(#shadow)">
      <rect x="973" y="365" width="260" height="177" rx="15" fill="#101820" stroke="#e98b70" stroke-opacity=".33"/>
      <g transform="translate(990 383) scale(.19)">${mark}</g>
      <text x="1023" y="400" fill="#f2f0eb" font-size="12" font-weight="700">CanalNonGrato</text>
      <circle cx="1211" cy="395" r="3" fill="#9dbda9"/>
      <text x="992" y="437" fill="#e4e8e9" font-size="12" font-weight="600">Canais não gratos</text>
      <rect x="1109" y="425" width="18" height="16" rx="4" fill="#e98b7017"/>
      <text x="1118" y="437" fill="#e98b70" font-size="10" text-anchor="middle">1</text>
      <circle cx="1005" cy="473" r="15" fill="#e98b7017" stroke="#e98b7033"/>
      <text x="1005" y="477" fill="#e9a18b" font-size="9" text-anchor="middle">CI</text>
      <text x="1031" y="470" fill="#e4e8e9" font-size="11" font-weight="600">Canal insistente</text>
      <text x="1031" y="486" fill="#8d9eac" font-size="9">@canalinsistente</text>
      <path d="M991 503h223" stroke="#ffffff12"/>
      <path d="m994 517 3 3 6-7" fill="none" stroke="#9dbda9" stroke-width="1.5" stroke-linecap="round"/>
      <text x="1010" y="520" fill="#91a2af" font-size="9">Lista salva no navegador.</text>
    </g>
    <text x="1222" y="582" fill="#8f9fac" font-size="14" text-anchor="end">allm4.com/canalnongrato</text>
  </g>
</svg>`;

await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'canalnongrato-cover.svg'), artwork + '\n');
await sharp(Buffer.from(artwork)).png({ compressionLevel: 9 }).toFile(path.join(output, 'canalnongrato-cover.png'));
console.log('Capa gerada em .github/assets/canalnongrato-cover.svg e .png.');
