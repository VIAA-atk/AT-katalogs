# VIAA asistīvo tehnoloģiju katalogs

Publiskais katalogs: <https://viaa-atk.github.io/AT-katalogs/>

Administratora panelis: <https://viaa-atk.github.io/AT-katalogs/admin/>

## Uzbūve

Vietne ir statiska un paredzēta GitHub Pages. Tai nav datubāzes vai servera:

- `index.html` un `assets/catalog-app.js` veido publisko katalogu;
- `data/catalog.json` ir vienīgais publiskās lapas datu avots;
- `data/catalog.schema.json` dokumentē datu shēmu;
- `assets/images/catalog/` glabā kartīšu attēlus;
- `admin/` ir administratora panelis;
- `scripts/validate-catalog.mjs` pārbauda datu struktūru un attēlu esamību;
- `.github/workflows/validate-catalog.yml` automātiski pārbauda izmaiņas GitHub vidē.

Publiskā lapa saglabā VIAA kataloga dizainu, filtrus, meklēšanu, kartītes,
modālos “Uzzināt vairāk” logus, ārējās saites un attēlu rezerves mehānismu.

## Administratora paneļa lietošana

### 1. Izveido ierobežotu GitHub tokenu

1. GitHub atver [Fine-grained personal access token izveidi](https://github.com/settings/personal-access-tokens/new).
2. Izvēlies īsu derīguma termiņu.
3. Pie “Repository access” izvēlies **Only select repositories** un tikai
   `VIAA-atk/AT-katalogs`.
4. Pie “Repository permissions” iestati **Contents — Read and write**.
5. Citas rakstīšanas atļaujas nav nepieciešamas.

### 2. Atver paneli

Atver <https://viaa-atk.github.io/AT-katalogs/admin/> un ievadi tokenu.
Panelis pārbauda, vai GitHub lietotājam ir rakstīšanas tiesības šajā
repozitorijā.

### 3. Labo katalogu

- **Pievienot jaunu ierakstu** izveido tukšu formu.
- Izvēloties ierakstu kreisajā sarakstā, to var labot.
- **Dzēst ierakstu** prasa atsevišķu apstiprinājumu.
- Rakstīšanas laikā ievadītajam tekstam šajā pārlūka cilnē tiek glabāta
  rezerves kopija, bet GitHub netiek mainīts fonā.
- **Saglabāt melnrakstā** atkārtoti ielādē jaunāko `catalog.json` un tā SHA,
  pēc tam lokāli apvieno tikai rediģētā ieraksta mainītos laukus.
- **Publicēt šo ierakstu** publicē tikai atvērto ierakstu.
- **Publicēt izmaiņas** publicē droši apvienojamos melnrakstus vienā GitHub
  commitā `main` zarā. Konfliktējošie ieraksti paliek melnrakstā.
- Konflikta sadaļā katram laukam izvēlies **Mana versija** vai **GitHub
  versija**, tad saglabā izvēli melnrakstā un publicē.
- **Atmest manu melnrakstu un ielādēt GitHub versiju** vispirms ielādē
  jaunāko GitHub versiju, tad atmet tikai konkrētā ieraksta melnrakstu.
  Citi melnraksti un citā ierakstā ievadītais teksts tiek saglabāti.
- Pēc veiksmīgas publicēšanas tiek izdzēsti tikai publicētie melnraksti.
  Atjaunojot 16. versijas melnrakstu tajā pašā cilnē, var izmantot šīs pašas
  konfliktu atrisināšanas iespējas. Ja vecai nesaglabātai formai nav sākotnējās
  versijas, pirms publicēšanas tās lauki jāpārskata.

Panelī var augšupielādēt JPG, PNG vai WebP attēlu līdz 8 MB, saglabājot tā
sākotnējo formātu. Jānorāda alternatīvais teksts, avota saite, ja tāda ir, un
attēla izmantošanas tiesību piezīme.

GitHub Pages atjaunošana pēc commita parasti aizņem dažas minūtes.

## Drošības modelis

- Administratora lapa pati par sevi nav slepena; rakstīšanu atļauj GitHub.
- Tokens netiek saglabāts `localStorage`, `sessionStorage`, sīkdatnēs, failos
  vai repozitorijā. Tas atrodas tikai atvērtās cilnes JavaScript atmiņā.
- Panelim nav ārēju JavaScript bibliotēku vai trešo pušu CDN.
- Datu un attēlu izmaiņas tiek apvienotas vienā atomārā Git commitā.
- Pirms katra publicēšanas mēģinājuma panelis ielādē jaunāko `catalog.json`,
  faila SHA un `main` commitu, pēc tam ar trīspusēju apvienošanu uzliek tikai
  šīs cilnes mainītos ierakstu laukus. Citu ierakstu izmaiņas tiek saglabātas.
- Ja GitHub atgriež `409` vai zara SHA vairs neatbilst, panelis vienu reizi
  atkārtoti ielādē jaunāko versiju, apvieno un publicē. Konflikts rodas, ja
  abas puses atšķirīgi mainījušas vienu lauku; jomu un vajadzību izvēļu secība
  netiek uzskatīta par satura izmaiņu. Konflikts, dzēšanas sadursme vai
  atkārtoti pievienojams attēls aptur tikai attiecīgā ieraksta publicēšanu.
  Secības sadursme neaptur ierakstu satura publicēšanu.
- Dzēstu ierakstu var atjaunot no GitHub commit vēstures.
- Attēla fails pēc ieraksta dzēšanas netiek automātiski dzēsts, lai nepieļautu
  neatgriezenisku vai kļūdainu koplietota attēla noņemšanu.

Tokenam ieteicams piešķirt tikai šo vienu repozitoriju un īsu derīguma
termiņu. Pēc darba panelī nospied **Atvienot** un aizver cilni.

## Validācija

Nepieciešams Node.js 22 vai jaunāks.

```sh
npm run validate
```

Validācija pārbauda:

- JSON sintaksi un obligātos laukus;
- unikālus ierakstu identifikatorus;
- klasifikatoru vērtības;
- HTTPS ārējās saites;
- lokālo attēlu ceļus un failu esamību;
- publiskās lapas un administratora paneļa JavaScript sintaksi.
- divu paralēlu administratora cilņu apvienošanu, konflikta apturēšanu un
  vienreizēju `409` atkārtojumu.
- paneļa saglabāšanas un publicēšanas darbības ar imitētu GitHub: vecs
  ARASAAC melnraksts un jauns Hugo.gov.lv ieraksts, lauku izvēles, individuāla
  atmešana, pārlāde un publicēto melnrakstu izdzēšana. Testi nemaina GitHub datus.

## Vēsturiskie migrācijas skripti

`scripts/export-catalog-data.mjs`, `scripts/apply-catalog-images.mjs`,
`scripts/apply-editorial-fixes.mjs` un attēlu būvēšanas skripti saglabāti kā
iepriekšējā prototipa migrācijas un audita rīki. Publiskā lapa vairs nelasa
datus no minificētā `assets/routes-C_WgTdsH.js`; pēc migrācijas autoritatīvais
avots ir tikai `data/catalog.json`.

## Attēlu tiesības

Attēlu izcelsmes un izmantošanas piezīmes ir saglabātas katrā
`data/catalog.json` ierakstā. Pirms gala publicēšanas atbildīgajai personai
jāpārliecinās par tiesībām attēlu pārpublicēt. Vēsturiskais avotu reģistrs ir
`data/catalog-image-sources.json`.

## Lovable sinhronizācija

Projekts ir savienots ar Lovable. Nedrīkst pārrakstīt publicēto Git vēsturi ar
`force push`, rebase vai jau publicētu commitu labošanu. Katrs jauns commits
`main` zarā sinhronizējas ar Lovable.
