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
- Lauku un attēla izmaiņas melnrakstā saglabājas automātiski aptuveni vienu
  sekundi pēc ievades; **Saglabāt melnrakstā** ļauj to izdarīt uzreiz.
- **Publicēt izmaiņas** izveido vienu GitHub commitu `main` zarā.

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
- Pirms publicēšanas panelis pārbauda, vai `main` nav mainījies. Ja ir radies
  konflikts, publicēšana tiek apturēta un svešas izmaiņas netiek pārrakstītas.
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
