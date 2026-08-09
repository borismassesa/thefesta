# Preparing a guest list for OpusPass

Share this with couples and coordinators before they build a guest list. Every
rule below reflects what the **Guests > Upload spreadsheet** importer actually
accepts, so a list that follows it will upload on the first try.

Kiswahili version follows the English one.

---

## 1. Rules that must be met

These are not preferences. A list that breaks one of them either fails to
upload or loses rows silently.

**1.1 Send an `.xlsx` or `.csv` file.**
Nothing else can be uploaded. Old `.xls` files, PDFs, Word documents, photos of
a list and screenshots are all rejected. Working in Google Sheets is fine:
choose File > Download > Microsoft Excel (.xlsx) before sending.

**1.2 One guest per row, one row per card.**
Each row becomes one digital card. A married couple invited together is **one
row** ("Mr & Mrs Ngando"), not two.

**1.3 Row 1 or 2 must be a header row.**
The importer finds your columns by reading their labels. A title line above the
header is fine. These labels are recognised:

| Column | Accepted labels |
|---|---|
| Name (required) | Name, Full Name, Jina, Jina Kamili, Majina |
| Phone | Phone, Mobile, WhatsApp, Namba ya Simu, Simu, Namba |
| Email (optional) | Email, Email Address, Barua Pepe |
| Ticket type (optional) | Ticket, Ticket Type, Invitation Type, Aina ya Tiketi |

Anything else you add (Na., Status, Maelezo, Notes) is ignored and safe to keep.

**1.4 Every row needs a name.**
A row with a blank name is skipped without warning. The name is printed on the
card exactly as written, so write "Mr & Mrs Joel Massawe", not "joel".

**1.5 Format the phone column as Text before typing numbers.**
In Excel, select the column, then Format > Cells > Text. A phone column left as
"Number" drops the leading zero, so 0755000850 becomes 755000850. We can usually
recover a Tanzanian mobile from that, but two costs remain: the same guest
written 0755000850 on one row and 755000850 on another is no longer recognised
as a duplicate, and a foreign number that loses its zero is read as Tanzanian
and sent to the wrong person. If numbers are already in the file, check that
every one still starts with 0 or +255.

**1.6 One phone number per row, and never the same number twice.**
Write 0755000850 or +255755000850. Do not put two numbers in one cell. If two
rows carry the same number, only the first is imported and the second is
dropped, because one number cannot receive two different cards.

**1.6.1 Guests outside Tanzania need the full country code.**
Write +254712345678 or +447700900123. A number with no country code is treated
as Tanzanian.

**1.7 Leave the cell empty when there is no number.**
Do not type "Hakuna namba", "N/A", "-" or "TBC". That text is saved as the
guest's phone number and the card fails to send. An empty cell is correct: the
guest imports fine and a number can be added later.

**1.8 Multi-sheet workbooks are supported.**
Every worksheet with a recognized Name / Jina header is imported. Review,
Summary, Budget and Instructions tabs are skipped because they do not have a
guest Name header. If two tabs are both genuine guest lists, both are imported;
duplicate phone numbers are removed across the combined batch.

**1.9 No merged cells, and no colour coding as data.**
A merged cell keeps its text in the first cell only and leaves the rest of the
merge empty, so a merged header stops a column from being recognised. Highlight
colours are not read at all, so anything meaningful must be written as text in
its own column.

---

## 2. What the sheet cannot set

| Item | How it is handled |
|---|---|
| Ticket type | Add an optional **Ticket Type** column containing Single, Double or Wakwe. Wakwe admits ten people on one QR code. Blank or unrecognized values become Single. |
| Table or seating | Set in Seating after the guests exist. |
| Which event a guest attends | Chosen in the upload dialog under "Invite all to", not in the sheet. |
| Totals rows | Ignored, so a JUMLA line at the bottom is harmless. |

---

## 3. Checklist before sending the file

- [ ] File is `.xlsx` or `.csv`
- [ ] Header row uses the labels in 1.3
- [ ] Every row has a name
- [ ] Phone column is formatted as Text and every number starts with 0, +255 or
      its own country code
- [ ] No number appears on two rows
- [ ] Empty cells instead of "Hakuna namba" or "N/A"
- [ ] Test and draft tabs deleted
- [ ] Read through once for the same guest entered twice under different names

---

## 4. Checklist after the upload (coordinator)

- [ ] The imported count matches the number of rows you expected. A gap means
      duplicate numbers or nameless rows were dropped.
- [ ] Spot check five guests: name spelling and phone number.
- [ ] Mark the Double and Wakwe tickets.
- [ ] Send to a small test group of three or four numbers and confirm they
      receive the card before sending to everyone.

---

## 5. Minimum working example

| Jina | Namba ya Simu | Barua Pepe |
|---|---|---|
| Mr & Mrs Ngando | 0713269227 | |
| Mama Maida | 0784305690 | maida@example.com |
| Mrs Joyce Nkembo | | |

Three columns are enough. Everything else is optional.

---
---

# Kuandaa orodha ya wageni kwa OpusPass

Sheria zote hapa chini zinafuata jinsi mfumo wa **Wageni > Pakia lahajedwali**
unavyosoma faili, kwa hiyo orodha inayozifuata itapakiwa mara ya kwanza.

## 1. Masharti ya lazima

**1.1 Tuma faili la `.xlsx` au `.csv`.**
Hakuna aina nyingine inayokubalika. Faili za zamani za `.xls`, PDF, Word, picha
za orodha na screenshots zote zinakataliwa. Ukitumia Google Sheets, chagua File
> Download > Microsoft Excel (.xlsx) kabla ya kutuma.

**1.2 Mgeni mmoja kwa mstari mmoja.**
Kila mstari unakuwa kadi moja ya kidijitali. Wanandoa wanaoalikwa pamoja ni
**mstari mmoja** ("Mr & Mrs Ngando"), siyo miwili.

**1.3 Mstari wa 1 au 2 lazima uwe wa vichwa vya safu.**
Mfumo hutambua safu kwa kusoma majina yake. Kichwa cha jumla juu ya safu
kinaruhusiwa. Majina yanayotambuliwa:

| Safu | Majina yanayokubalika |
|---|---|
| Jina (lazima) | Jina, Jina Kamili, Majina, Name, Full Name |
| Simu | Namba ya Simu, Simu, Namba, WhatsApp, Phone, Mobile |
| Barua pepe (hiari) | Barua Pepe, Email, Email Address |
| Aina ya tiketi (hiari) | Aina ya Tiketi, Ticket Type, Ticket, Invitation Type |

Safu nyingine zozote (Na., Status, Maelezo) hazisomwi na unaweza kuziacha.

**1.4 Kila mstari lazima uwe na jina.**
Mstari usio na jina unarukwa bila taarifa. Jina linachapishwa kwenye kadi jinsi
lilivyoandikwa, kwa hiyo andika "Mr & Mrs Joel Massawe", siyo "joel".

**1.5 Weka safu ya simu kuwa Text kabla ya kuandika namba.**
Katika Excel chagua safu, kisha Format > Cells > Text. Safu iliyoachwa kama
"Number" inaondoa sifuri ya mwanzo, hivyo 0755000850 inakuwa 755000850. Mara
nyingi tunaweza kurudisha namba ya Tanzania kutoka hapo, lakini hasara mbili
zinabaki: mgeni yule yule aliyeandikwa 0755000850 mstari mmoja na 755000850
mstari mwingine hatambuliki tena kama marudio, na namba ya nchi nyingine
iliyopoteza sifuri inasomwa kama ya Tanzania na kadi inamfikia mtu mwingine.
Kama namba tayari zipo, hakikisha kila moja bado inaanza na 0 au +255.

**1.6 Namba moja kwa mstari, na isirudiwe.**
Andika 0755000850 au +255755000850. Usiweke namba mbili kwenye kisanduku kimoja.
Mistari miwili yenye namba ile ile: wa kwanza pekee ndiye anaingizwa, wa pili
anaachwa, kwa sababu namba moja haiwezi kupokea kadi mbili tofauti.

**1.6.1 Wageni walio nje ya Tanzania wanahitaji msimbo kamili wa nchi.**
Andika +254712345678 au +447700900123. Namba isiyo na msimbo wa nchi
inachukuliwa kuwa ya Tanzania.

**1.7 Acha kisanduku wazi kama hakuna namba.**
Usiandike "Hakuna namba", "N/A", "-" wala "TBC". Maandishi hayo yanahifadhiwa
kama namba ya simu ya mgeni na kadi inashindwa kutumwa. Kisanduku kitupu ndiyo
sahihi: mgeni anaingia salama na namba inaweza kuongezwa baadaye.

**1.8 Faili yenye tabo nyingi inaruhusiwa.**
Kila tabo yenye kichwa cha Name / Jina kinachotambulika inaingizwa. Tabo za
Review, Summary, Budget na Instructions zinarukwa kwa sababu hazina kichwa cha
jina la mgeni. Tabo mbili zikiwa orodha halisi za wageni, zote zinaingizwa;
namba za simu zilizorudiwa zinaondolewa kwenye mkusanyiko mzima.

**1.9 Hakuna visanduku vilivyounganishwa, na rangi si taarifa.**
Kisanduku kilichounganishwa (merged) kinabaki na maandishi kwenye kisanduku cha
kwanza pekee na vingine vinabaki vitupu, kwa hiyo kichwa kilichounganishwa
kinazuia safu isitambulike. Rangi hazisomwi kabisa, kwa hiyo kila taarifa muhimu
lazima iandikwe kama maandishi kwenye safu yake.

---

## 2. Mambo lahajedwali haliwezi kupanga

| Kipengele | Jinsi inavyoshughulikiwa |
|---|---|
| Aina ya tiketi | Ongeza safu ya hiari ya **Aina ya Tiketi / Ticket Type** yenye Single, Double au Wakwe. Wakwe huingiza watu kumi kwa QR moja. Nafasi tupu au thamani isiyotambulika inaingia kama Single. |
| Meza na mpangilio wa viti | Hupangwa kwenye Seating baada ya wageni kuingia. |
| Tukio analohudhuria mgeni | Huchaguliwa kwenye dirisha la kupakia chini ya "Invite all to", siyo kwenye lahajedwali. |
| Mstari wa jumla | Hurukwa, kwa hiyo JUMLA chini ya orodha haileti tatizo. |

---

## 3. Orodha ya kukagua kabla ya kutuma faili

- [ ] Faili ni `.xlsx` au `.csv`
- [ ] Mstari wa vichwa unatumia majina ya 1.3
- [ ] Kila mstari una jina
- [ ] Safu ya simu ni Text na kila namba inaanza na 0, +255 au msimbo wa nchi yake
- [ ] Hakuna namba inayojirudia kwenye mistari miwili
- [ ] Visanduku vitupu badala ya "Hakuna namba" au "N/A"
- [ ] Tabo za majaribio na rasimu zimefutwa
- [ ] Umepitia mara moja kuona kama mgeni mmoja ameandikwa mara mbili kwa majina tofauti

---

## 4. Orodha ya kukagua baada ya kupakia (mratibu)

- [ ] Idadi iliyoingia inalingana na mistari uliyotarajia. Tofauti inamaanisha
      namba zilizojirudia au mistari isiyo na majina iliachwa.
- [ ] Kagua wageni watano: tahajia ya jina na namba ya simu.
- [ ] Weka alama ya tiketi za Double na Wakwe.
- [ ] Tuma kwa kikundi kidogo cha majaribio cha namba tatu au nne na thibitisha
      wamepokea kadi kabla ya kutuma kwa wote.

---

## 5. Mfano mdogo unaotosha

| Jina | Namba ya Simu | Barua Pepe |
|---|---|---|
| Mr & Mrs Ngando | 0713269227 | |
| Mama Maida | 0784305690 | maida@example.com |
| Mrs Joyce Nkembo | | |

Safu tatu zinatosha. Nyingine zote ni za hiari.
