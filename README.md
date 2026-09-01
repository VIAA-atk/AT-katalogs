# AT Katalogs LV GitHub

Izveido funkcionējošu publiska asistīvo tehnoloģiju kataloga prototipu latviešu valodā.

Vizuālajai identitātei izmanto pašreizējo VIAA kataloga dizainu:

https://viaa-at.github.io/katalogs/catalog.html

Kataloga uzbūves un lietošanas vienkāršības paraugs:

https://www.openaccess-ca.org/at-resource-flipkit

Izmanto arī pievienotos VIAA priekšizpētes dokumentus, lai saprastu:

asistīvo tehnoloģiju mācību atbalsta jomas;

tehnoloģiju iedalījumu;

katalogā iekļaujamos risinājumus;

lietotājiem nepieciešamo informāciju.

Šajā posmā izveido tikai kataloga publiskās sākumlapas pirmo versiju. Neveido datubāzi, autentifikāciju, administrēšanas vidi, rezervēšanu, pieteikuma iesniegšanu vai citus backend risinājumus.

Kataloga mērķis

Katalogs paredzēts pedagogiem, atbalsta speciālistiem, vecākiem un citiem interesentiem. Tam jāpalīdz vienkārši atrast asistīvās tehnoloģijas un saistītos resursus.

Tas nav individuālo vajadzību izvērtēšanas, diagnostikas vai tehnoloģiju piešķiršanas rīks.

Lapas struktūra

Izveido:

VIAA stilam atbilstošu galveni;

nosaukumu “Asistīvo tehnoloģiju katalogs”;

īsu ievadu par kataloga izmantošanu;

kompaktu filtru joslu;

resursu kartīšu režģi;

vienkāršu kājeni.

Filtri

Izmanto tikai trīs nolaižamās izvēlnes.

Mācību atbalsta joma

Visas jomas;

Lasīšana;

Rakstīšana;

Matemātika;

Komunikācija;

Uzmanība, atmiņa un organizēšana;

Piekļuve videi un tehnoloģijām.

Es meklēju

Visus risinājumus;

Teksta priekšā lasīšanu;

Teksta vizuālu pielāgošanu;

Drukāta teksta digitalizēšanu;

Runas pārvēršanu tekstā;

Atbalstu rakstīšanai un pareizrakstībai;

Atbalstu darba organizēšanai;

Simbolus un vizuālo atbalstu;

Alternatīvu saziņas veidu;

Pielāgotu ierīces vadību;

Atbalstu matemātikas uzdevumiem.

Resursa veids

Visi resursi;

Ierīce;

Programmatūra vai lietotne;

Iebūvēta piekļūstamības funkcija;

Bezmaksas digitālais rīks;

Metodiskais materiāls vai pamācība.

Pievieno arī:

vienkāršu meklēšanas lauku pēc nosaukuma;

pogu “Notīrīt filtrus”;

atrasto rezultātu skaitu.

Rezultātiem jāatjaunojas automātiski.

Resursu kartītes

Katrā kartītē parādi:

attēla vietu;

tehnoloģijas vai resursa nosaukumu;

īsu aprakstu;

mācību atbalsta jomu;

resursa veidu;

norādi par latviešu valodas pieejamību;

pogu “Uzzināt vairāk”.

Izveido 10–12 demonstrācijas kartītes, izmantojot pievienotajos dokumentos un pašreizējā VIAA katalogā minētus piemērus.

Neizdomā nezināmus faktus, cenas vai juridiskus apgalvojumus. Ja informācijas nav, raksti “Informācija tiks papildināta”.

Nospiežot “Uzzināt vairāk”, atver vienkāršu modālo logu ar:

lielāku attēlu;

īsu aprakstu;

galvenajām funkcijām;

piemēriem, kādās mācību situācijās risinājums var palīdzēt;

saiti uz ārējo resursu vai ražotāja vietni;

aizvēršanas pogu.

Dizains

Saglabā VIAA kataloga violeto vizuālo identitāti.

Izkārtojuma vienkāršībā iedvesmojies no AT Resource FlipKit.

Neveido interneta veikala izskatu.

Neizmanto pārmērīgus gradientus, ēnas vai animācijas.

Izmanto īstu latviešu valodas saturu.

Veido skaidru, mierīgu un institucionālu dizainu.

Nodrošini responsīvu datora, planšetes un telefona izkārtojumu.

Ievēro WCAG 2.2 AA piekļūstamības pamatprincipus.

Pirms koda veidošanas īsi izplāno lapas komponentes un datu struktūru. Ja kāds būtisks jautājums nav skaidrs, vispirms uzdod man precizējošus jautājumus.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/907ddc8c-5f4a-4595-825e-f2d11ef10eac).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Kataloga attēli

Katrai no 106 risinājumu kartītēm ir lokāls attēls mapē
`assets/images/catalog`:

- konkrētiem produktiem izmantots ražotāja produkta lapas kopīgošanas attēls;
- vispārīgām risinājumu kategorijām izmantota neitrāla, šim prototipam veidota ilustrācija.

Kartītes attēls jaunā pārlūka cilnē atver attiecīgā produkta, risinājuma vai
autoritatīva atsauces resursa lapu. Poga “Uzzināt vairāk” atver risinājuma
informācijas logu. Fails `assets/catalog-fallback.js` nodrošina pogas darbību
arī tad, ja `index.html` tiek atvērts lokāli no datora un pārlūks neielādē
moduļu JavaScript pakotnes.

Attēlu avoti un piezīmes par izmantošanas tiesībām ir apkopotas failā
`data/catalog-image-sources.json`. Turpat katram ierakstam norādīta attēla
saite (`product_page`) un saites veids (`link_type`). Vispārīgām kategorijām,
kurām nav viena konkrēta produkta, saite ved uz produkta kategoriju vai
autoritatīvu atsauces resursu. Pirms gala publicēšanas jāpārbauda vai jāsaņem
atļauja to ražotāju attēlu pārpublicēšanai, kuri reģistrā atzīmēti ar
`source_type: "manufacturer"`.

Attēlu komplektu un publicēto statisko lapu var atjaunot ar komandām:

```sh
node scripts/build-catalog-images.mjs
node scripts/apply-catalog-images.mjs
```
