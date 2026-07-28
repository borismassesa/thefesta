-- Seed the onboarding wizard's Site UI CMS row with the full bilingual
-- content that used to live in apps/vendors_portal/src/lib/onboarding/strings.ts
-- (a static dictionary of English/Swahili pairs). The English values already
-- match the code-level fallback in portal-ui-fallback.ts; the Swahili values
-- here are the exact hand-translated text that was already live in
-- production, so switching the onboarding wizard over to the CMS-backed
-- pattern doesn't lose or regress any existing translation -- it only makes
-- them admin-editable going forward at /cms/vendors-portal/site-ui/onboarding.
-- Also includes 3 keys (profile.name.logo.label/hint,
-- review.done.celebration_aria) that were hardcoded English-only gaps in the
-- old dictionary, newly translated here.

insert into website_page_sections (page_key, section_key, content, is_published) values
(
  'vendors-portal-ui-onboarding', 'copy',
  '{
  "common.back": {
    "en": "Back",
    "sw": "Rudi"
  },
  "common.continue": {
    "en": "Continue",
    "sw": "Endelea"
  },
  "common.next_step": {
    "en": "Next step",
    "sw": "Hatua inayofuata"
  },
  "common.skip_for_now": {
    "en": "Skip for now",
    "sw": "Ruka kwa sasa"
  },
  "common.cancel": {
    "en": "Cancel",
    "sw": "Ghairi"
  },
  "common.got_it": {
    "en": "Got it",
    "sw": "Nimeelewa"
  },
  "common.why_we_ask": {
    "en": "Why we ask",
    "sw": "Kwa nini tunauliza"
  },
  "common.try_again": {
    "en": "Try again",
    "sw": "Jaribu tena"
  },
  "common.remove": {
    "en": "Remove",
    "sw": "Ondoa"
  },
  "common.not_set": {
    "en": "Not set",
    "sw": "Haijawekwa"
  },
  "common.close": {
    "en": "Close",
    "sw": "Funga"
  },
  "common.edit": {
    "en": "Edit",
    "sw": "Hariri"
  },
  "common.yes": {
    "en": "Yes",
    "sw": "Ndiyo"
  },
  "common.no": {
    "en": "No",
    "sw": "Hapana"
  },
  "common.other": {
    "en": "Other",
    "sw": "Nyingine"
  },
  "common.none_selected": {
    "en": "None selected",
    "sw": "Hakuna iliyochaguliwa"
  },
  "common.select_all_that_apply": {
    "en": "Select all that apply.",
    "sw": "Chagua zote zinazohusika."
  },
  "stepper.aria.home": {
    "en": "OpusFesta home",
    "sw": "Mwanzo wa OpusFesta"
  },
  "stepper.aria.progress": {
    "en": "Onboarding progress",
    "sw": "Maendeleo ya usajili"
  },
  "stepper.profile": {
    "en": "{label} profile",
    "sw": "Wasifu wa {label}"
  },
  "stepper.details": {
    "en": "Details",
    "sw": "Maelezo"
  },
  "stepper.pricing": {
    "en": "Pricing",
    "sw": "Bei"
  },
  "stepper.review": {
    "en": "Review",
    "sw": "Kagua"
  },
  "category.title": {
    "en": "What type of vendor are you?",
    "sw": "Wewe ni mtoa huduma wa aina gani?"
  },
  "category.custom_placeholder": {
    "en": "Describe your vendor type…",
    "sw": "Eleza aina yako ya huduma…"
  },
  "category.error.title": {
    "en": "Could not load this step",
    "sw": "Imeshindikana kupakia hatua hii"
  },
  "category.error.body": {
    "en": "Something went wrong loading the category selection. Tap below to try again.",
    "sw": "Hitilafu imetokea wakati wa kupakia uchaguzi wa kategoria. Gusa hapa chini kujaribu tena."
  },
  "vows.title": {
    "en": "Before we start, meet our Vendor Vows",
    "sw": "Kabla hatujaanza, fahamu Viapo vyetu vya Watoa Huduma"
  },
  "vows.subtitle": {
    "en": "As an OpusFesta vendor, you pledge to uphold these values:",
    "sw": "Kama mtoa huduma wa OpusFesta, unaahidi kuzingatia maadili haya:"
  },
  "vows.cta": {
    "en": "Say \"I do\"",
    "sw": "Sema \"Naapa\""
  },
  "vows.why.title": {
    "en": "Why the Vendor Vows?",
    "sw": "Kwa nini Viapo vya Watoa Huduma?"
  },
  "vows.why.body1": {
    "en": "The Vendor Vows are how OpusFesta keeps the marketplace a respectful, trusted space for every couple in Tanzania.",
    "sw": "Viapo vya Watoa Huduma ndivyo OpusFesta inavyohakikisha soko linabaki mahali pa heshima na linaloaminika kwa kila wachumba nchini Tanzania."
  },
  "vows.why.body2": {
    "en": "Couples can see which vendors have signed the vows, and we may remove vendors who don''t uphold them. Signing is a one-time pledge. You won''t see this screen again.",
    "sw": "Wachumba wanaweza kuona watoa huduma waliotia saini viapo, na tunaweza kuwaondoa wasiozingatia. Kutia saini ni ahadi ya mara moja. Hutaona skrini hii tena."
  },
  "profile.name.title": {
    "en": "What is your name?",
    "sw": "Jina lako ni nani?"
  },
  "profile.name.first.label": {
    "en": "First name",
    "sw": "Jina la kwanza"
  },
  "profile.name.last.label": {
    "en": "Last name",
    "sw": "Jina la ukoo"
  },
  "profile.name.business.label": {
    "en": "Business name",
    "sw": "Jina la biashara"
  },
  "profile.name.business.placeholder": {
    "en": "e.g. Festa Films",
    "sw": "mf. Festa Films"
  },
  "profile.location.title": {
    "en": "Where is your business located?",
    "sw": "Biashara yako ipo wapi?"
  },
  "profile.location.house.label": {
    "en": "Building / Plot number",
    "sw": "Namba ya jengo / kiwanja"
  },
  "profile.location.house.placeholder": {
    "en": "e.g. Plot 24, Building 12B",
    "sw": "mf. Kiwanja 24, Jengo 12B"
  },
  "profile.location.street.label": {
    "en": "Street / Village",
    "sw": "Mtaa / Kijiji"
  },
  "profile.location.street.placeholder": {
    "en": "e.g. Mwenge",
    "sw": "mf. Mtaa wa Mwenge"
  },
  "profile.location.ward.label": {
    "en": "Ward",
    "sw": "Kata"
  },
  "profile.location.ward.placeholder": {
    "en": "e.g. Kinondoni",
    "sw": "mf. Kinondoni"
  },
  "profile.location.district.label": {
    "en": "District",
    "sw": "Wilaya"
  },
  "profile.location.district.placeholder": {
    "en": "e.g. Kinondoni",
    "sw": "mf. Kinondoni"
  },
  "profile.location.region.label": {
    "en": "Region",
    "sw": "Mkoa"
  },
  "profile.location.region.placeholder": {
    "en": "Select region",
    "sw": "Chagua mkoa"
  },
  "profile.location.landmark.label": {
    "en": "Landmark / directions (optional)",
    "sw": "Alama ya kujulikana (hiari)"
  },
  "profile.location.landmark.placeholder": {
    "en": "e.g. Near Mlimani City, opposite the mosque",
    "sw": "mf. Karibu na Mlimani City, mkabala na msikiti"
  },
  "profile.location.postal.label": {
    "en": "P.O. Box / Postal code (optional)",
    "sw": "S.L.P / Msimbo wa posta (hiari)"
  },
  "profile.location.postal.placeholder": {
    "en": "e.g. P.O. Box 1234 or 11101",
    "sw": "mf. S.L.P 1234 au 11101"
  },
  "profile.location.phone.label": {
    "en": "Business phone (Tanzania)",
    "sw": "Simu ya biashara (Tanzania)"
  },
  "profile.location.phone.placeholder": {
    "en": "754 123 456",
    "sw": "754 123 456"
  },
  "profile.location.why.title": {
    "en": "Why we ask for your address",
    "sw": "Kwa nini tunaomba anwani yako"
  },
  "profile.location.why.body1": {
    "en": "We use your address to set your home market and to surface your storefront to couples planning weddings nearby.",
    "sw": "Tunatumia anwani yako kuweka soko lako la nyumbani na kuonyesha duka lako kwa wachumba wanaopanga harusi karibu nawe."
  },
  "profile.location.why.body2": {
    "en": "Your full street address stays private. Only your city and region appear on your public storefront. Your phone number is shared only after a couple sends you an inquiry.",
    "sw": "Anwani yako kamili ya mtaa inabaki siri. Ni jiji na mkoa wako tu vinavyoonekana kwenye duka lako la umma. Namba yako ya simu inashirikiwa tu baada ya wachumba kukutumia ombi."
  },
  "profile.contact.title": {
    "en": "How should couples reach you?",
    "sw": "Wachumba wakufikieje?"
  },
  "profile.contact.subtitle": {
    "en": "We send inquiry alerts to your email and your WhatsApp. Most Tanzanian couples message vendors on WhatsApp first.",
    "sw": "Tunatuma taarifa za maombi kwenye barua pepe yako na WhatsApp. Wachumba wengi wa Tanzania huwasiliana na watoa huduma kwa WhatsApp kwanza."
  },
  "profile.contact.email.label": {
    "en": "Business email",
    "sw": "Barua pepe ya biashara"
  },
  "profile.contact.email.placeholder": {
    "en": "hello@yourstudio.co.tz",
    "sw": "hello@yourstudio.co.tz"
  },
  "profile.contact.email.hint": {
    "en": "We use this for inquiry alerts, payouts, and account recovery. Never shown publicly.",
    "sw": "Tunaitumia kwa taarifa za maombi, malipo, na kurejesha akaunti. Haionyeshwi hadharani."
  },
  "profile.contact.whatsapp.label": {
    "en": "WhatsApp number",
    "sw": "Namba ya WhatsApp"
  },
  "profile.contact.whatsapp.placeholder": {
    "en": "754 123 456",
    "sw": "754 123 456"
  },
  "profile.contact.same_as_phone": {
    "en": "Same as my business phone (+255 …)",
    "sw": "Sawa na simu yangu ya biashara (+255 …)"
  },
  "profile.contact.why.title": {
    "en": "Why we ask for email and WhatsApp",
    "sw": "Kwa nini tunaomba barua pepe na WhatsApp"
  },
  "profile.contact.why.body1": {
    "en": "Inquiries arrive at both your email and your WhatsApp so you never miss a couple, and so couples get a fast first response, which is the single biggest driver of bookings on OpusFesta.",
    "sw": "Maombi yanawasili kwenye barua pepe na WhatsApp yako ili usiwakose wachumba, na ili wachumba wapate jibu la haraka — jambo kuu linaloleta uhifadhi kwenye OpusFesta."
  },
  "profile.contact.why.body2": {
    "en": "Your WhatsApp number is only shared with couples after they send you an inquiry. Email is never shown publicly.",
    "sw": "Namba yako ya WhatsApp inashirikiwa na wachumba tu baada ya kukutumia ombi. Barua pepe haionyeshwi hadharani."
  },
  "profile.socials.title": {
    "en": "Where can couples see your work online?",
    "sw": "Wachumba wanaweza kuona kazi yako mtandaoni wapi?"
  },
  "profile.socials.subtitle": {
    "en": "Couples almost always check Instagram and TikTok before reaching out. Add at least one. You can leave the rest blank.",
    "sw": "Wachumba karibu kila mara hukagua Instagram na TikTok kabla ya kuwasiliana. Ongeza angalau moja. Nyingine unaweza kuziacha wazi."
  },
  "profile.socials.instagram.label": {
    "en": "Instagram",
    "sw": "Instagram"
  },
  "profile.socials.instagram.placeholder": {
    "en": "yourstudio_tz",
    "sw": "yourstudio_tz"
  },
  "profile.socials.tiktok.label": {
    "en": "TikTok",
    "sw": "TikTok"
  },
  "profile.socials.tiktok.placeholder": {
    "en": "yourstudio",
    "sw": "yourstudio"
  },
  "profile.socials.facebook.label": {
    "en": "Facebook page",
    "sw": "Ukurasa wa Facebook"
  },
  "profile.socials.facebook.placeholder": {
    "en": "facebook.com/yourstudio or YourStudio",
    "sw": "facebook.com/yourstudio au YourStudio"
  },
  "profile.socials.website.label": {
    "en": "Website",
    "sw": "Tovuti"
  },
  "profile.socials.website.placeholder": {
    "en": "https://yourstudio.co.tz",
    "sw": "https://yourstudio.co.tz"
  },
  "profile.socials.why.title": {
    "en": "Why we ask for socials",
    "sw": "Kwa nini tunaomba mitandao ya kijamii"
  },
  "profile.socials.why.body1": {
    "en": "Vendors with at least one linked social account get 3-4× more inquiries than those without. Couples want to scroll your real work, not just your packages.",
    "sw": "Watoa huduma wenye angalau akaunti moja ya mtandao wa kijamii hupata maombi mara 3-4 zaidi ya wasio nayo. Wachumba wanataka kuona kazi yako halisi, si vifurushi tu."
  },
  "profile.socials.why.body2": {
    "en": "Instagram and TikTok matter most for visual categories (photo, video, decor, beauty). Facebook is still where many TZ couples find venues. You can always add or remove these later from your dashboard.",
    "sw": "Instagram na TikTok ni muhimu zaidi kwa kategoria za picha (picha, video, mapambo, urembo). Facebook bado ndipo wachumba wengi wa Tanzania hupata kumbi. Unaweza kuongeza au kuondoa hizi baadaye kutoka dashibodi yako."
  },
  "profile.markets.title": {
    "en": "Based on your address, {market} is your home market.",
    "sw": "Kulingana na anwani yako, {market} ni soko lako la nyumbani."
  },
  "profile.markets.subtitle": {
    "en": "Expand your service area by selecting the markets where you''ll travel for your standard fees. You can add more markets later.",
    "sw": "Panua eneo lako la huduma kwa kuchagua masoko utakayosafiri kwa ada zako za kawaida. Unaweza kuongeza masoko zaidi baadaye."
  },
  "profile.markets.home_suffix": {
    "en": "(home)",
    "sw": "(nyumbani)"
  },
  "profile.markets.why.title": {
    "en": "Why we ask about service area",
    "sw": "Kwa nini tunauliza kuhusu eneo la huduma"
  },
  "profile.markets.why.body1": {
    "en": "Your service area decides where OpusFesta shows your storefront. Couples planning a wedding in Zanzibar, Arusha, or anywhere you’ve selected will see you in their search results.",
    "sw": "Eneo lako la huduma huamua wapi OpusFesta inaonyesha duka lako. Wachumba wanaopanga harusi Zanzibar, Arusha, au popote ulipochagua watakuona kwenye matokeo yao ya utafutaji."
  },
  "profile.markets.why.body2": {
    "en": "Pick only the markets where you''ll travel for your standard fee. You can add per-trip travel charges later. You can update this anytime from your dashboard.",
    "sw": "Chagua masoko tu utakayosafiri kwa ada yako ya kawaida. Unaweza kuongeza gharama za safari kwa kila safari baadaye. Unaweza kubadilisha hili wakati wowote kutoka dashibodi yako."
  },
  "details.about.title": {
    "en": "Tell couples about your work",
    "sw": "Waeleze wachumba kuhusu kazi yako"
  },
  "details.about.subtitle": {
    "en": "This is the first thing couples will read on your storefront. Be specific about what makes your work yours. Couples decide quickly.",
    "sw": "Hiki ndicho kitu cha kwanza wachumba watakachosoma kwenye duka lako. Eleza kwa undani kinachoifanya kazi yako kuwa ya kipekee. Wachumba huamua haraka."
  },
  "details.about.bio.label": {
    "en": "About your business",
    "sw": "Kuhusu biashara yako"
  },
  "details.about.bio.placeholder": {
    "en": "e.g. Editorial documentary photographer that captures atmosphere, not just moments. Based in Dar es Salaam, available across East Africa.",
    "sw": "mf. Mpiga picha wa kihariri anayenasa hisia, si matukio tu. Yupo Dar es Salaam, anapatikana Afrika Mashariki."
  },
  "details.about.bio.hint_more_one": {
    "en": "{n} more character to go (min {min}).",
    "sw": "Herufi {n} zaidi inahitajika (chini {min})."
  },
  "details.about.bio.hint_more_other": {
    "en": "{n} more characters to go (min {min}).",
    "sw": "Herufi {n} zaidi zinahitajika (chini {min})."
  },
  "details.about.bio.hint_ok": {
    "en": "{n} characters. Looking good.",
    "sw": "Herufi {n}. Inaonekana vizuri."
  },
  "details.about.description.label": {
    "en": "Short description",
    "sw": "Maelezo mafupi"
  },
  "details.about.description.placeholder": {
    "en": "One line couples see on your listing card. If you leave it blank, we use the start of your bio.",
    "sw": "Mstari mmoja wachumba wanaouona kwenye kadi yako. Ukiacha wazi, tutatumia mwanzo wa wasifu wako."
  },
  "details.about.description.hint": {
    "en": "{n}/200 characters.",
    "sw": "Herufi {n}/200."
  },
  "details.about.years.label": {
    "en": "Years in business",
    "sw": "Miaka katika biashara"
  },
  "details.about.years.placeholder": {
    "en": "e.g. 11",
    "sw": "mf. 11"
  },
  "details.about.languages.label": {
    "en": "Languages spoken with clients",
    "sw": "Lugha unazozungumza na wateja"
  },
  "details.services.title": {
    "en": "Do you offer any of these special services?",
    "sw": "Je, unatoa huduma yoyote kati ya hizi maalum?"
  },
  "details.services.custom.heading": {
    "en": "Other services",
    "sw": "Huduma nyingine"
  },
  "details.services.custom.hint": {
    "en": "Add anything specific to your business that isn''t in the list above.",
    "sw": "Ongeza chochote mahususi kwa biashara yako ambacho hakipo kwenye orodha hapo juu."
  },
  "details.services.custom.label": {
    "en": "Add another service",
    "sw": "Ongeza huduma nyingine"
  },
  "details.services.custom.placeholder": {
    "en": "e.g. Bridal henna sessions",
    "sw": "mf. Huduma ya hina ya bibi harusi"
  },
  "details.services.custom.add": {
    "en": "Add",
    "sw": "Ongeza"
  },
  "details.services.custom.remove": {
    "en": "Remove",
    "sw": "Ondoa"
  },
  "details.style.title": {
    "en": "Let''s talk style. Which style do you enjoy capturing most?",
    "sw": "Tuzungumze mtindo. Ni mtindo gani unaofurahia zaidi kunasa?"
  },
  "details.style.subtitle": {
    "en": "We know you can probably do multiple styles. We want to connect you with couples who value what you love to do.",
    "sw": "Tunajua pengine unaweza mitindo mingi. Tunataka kukuunganisha na wachumba wanaothamini unachopenda kufanya."
  },
  "details.personality.title": {
    "en": "What''s one word clients would use to describe your personality?",
    "sw": "Ni neno gani moja wateja wangetumia kuelezea tabia yako?"
  },
  "details.personality.subtitle": {
    "en": "We''re sure you can adapt to any group, but we want to know the trait you''re most proud of.",
    "sw": "Tuna uhakika unaweza kuendana na kundi lolote, lakini tunataka kujua sifa unayojivunia zaidi."
  },
  "pricing.title": {
    "en": "Let''s talk pricing",
    "sw": "Tuzungumze bei"
  },
  "pricing.subtitle": {
    "en": "Tanzanian couples shop by package. Add the tiers you offer. Bronze / Silver / Gold, hours of coverage, or whatever fits how you sell.",
    "sw": "Wachumba wa Tanzania hununua kwa vifurushi. Ongeza ngazi unazotoa. Shaba / Fedha / Dhahabu, saa za huduma, au chochote kinachoendana na jinsi unavyouza."
  },
  "pricing.starting_from.label": {
    "en": "Starting from (shown on storefront)",
    "sw": "Kuanzia (inaonyeshwa dukani)"
  },
  "pricing.starting_from.placeholder": {
    "en": "e.g. 1,500,000",
    "sw": "mf. 1,500,000"
  },
  "pricing.starting_from.hint": {
    "en": "Optional headline price couples see first. Leave blank to show the lowest package price.",
    "sw": "Bei kuu ya hiari wachumba wanayoiona kwanza. Acha wazi ili kuonyesha bei ya chini kabisa ya kifurushi."
  },
  "pricing.custom_quotes.label": {
    "en": "I also offer custom quotes",
    "sw": "Pia natoa makadirio maalum"
  },
  "pricing.custom_quotes.hint": {
    "en": "Couples can ask for a tailored package outside these tiers.",
    "sw": "Wachumba wanaweza kuomba kifurushi maalum nje ya ngazi hizi."
  },
  "pricing.your_packages": {
    "en": "Your packages",
    "sw": "Vifurushi vyako"
  },
  "pricing.use_suggested": {
    "en": "Use suggested",
    "sw": "Tumia vilivyopendekezwa"
  },
  "pricing.start_from_scratch": {
    "en": "Start from scratch",
    "sw": "Anza upya"
  },
  "pricing.empty": {
    "en": "No packages yet. Pick a starting point. You can switch later.",
    "sw": "Bado hakuna vifurushi. Chagua mahali pa kuanzia. Unaweza kubadilisha baadaye."
  },
  "pricing.use_suggested_for": {
    "en": "Use suggested for {category}",
    "sw": "Tumia vilivyopendekezwa kwa {category}"
  },
  "pricing.package_n": {
    "en": "Package {n}",
    "sw": "Kifurushi {n}"
  },
  "pricing.package.name.label": {
    "en": "Name",
    "sw": "Jina"
  },
  "pricing.package.name.placeholder": {
    "en": "e.g. Signature, 6-hour, Gold",
    "sw": "mf. Signature, saa 6, Dhahabu"
  },
  "pricing.package.price.label": {
    "en": "Price (TSh)",
    "sw": "Bei (TSh)"
  },
  "pricing.package.price.placeholder": {
    "en": "e.g. 2,500,000",
    "sw": "mf. 2,500,000"
  },
  "pricing.package.desc.label": {
    "en": "One-line description",
    "sw": "Maelezo ya mstari mmoja"
  },
  "pricing.package.desc.placeholder": {
    "en": "e.g. 6-hour ceremony + reception coverage",
    "sw": "mf. Huduma ya saa 6 ya sherehe + mapokezi"
  },
  "pricing.package.included.label": {
    "en": "What''s included",
    "sw": "Kilichomo"
  },
  "pricing.package.item_n.placeholder": {
    "en": "Item {n}",
    "sw": "Kipengele {n}"
  },
  "pricing.add_item": {
    "en": "Add item",
    "sw": "Ongeza kipengele"
  },
  "pricing.add_package": {
    "en": "Add another package",
    "sw": "Ongeza kifurushi kingine"
  },
  "pricing.remove_package": {
    "en": "Remove package",
    "sw": "Ondoa kifurushi"
  },
  "pricing.remove_item": {
    "en": "Remove item",
    "sw": "Ondoa kipengele"
  },
  "pricing.replace.title": {
    "en": "Replace your packages?",
    "sw": "Badilisha vifurushi vyako?"
  },
  "pricing.replace.body": {
    "en": "We''ll swap in the suggested templates for {category}. Anything you''ve typed into the current packages will be lost.",
    "sw": "Tutaweka violezo vilivyopendekezwa kwa {category}. Chochote ulichoandika kwenye vifurushi vya sasa kitapotea."
  },
  "pricing.replace.confirm": {
    "en": "Replace packages",
    "sw": "Badilisha vifurushi"
  },
  "pricing.replace.cancel": {
    "en": "Keep mine",
    "sw": "Baki na vyangu"
  },
  "pricing.clear.title": {
    "en": "Start from scratch?",
    "sw": "Anza upya?"
  },
  "pricing.clear.body_one": {
    "en": "We''ll clear your {n} package and let you pick a starting point again. Anything you''ve typed will be lost.",
    "sw": "Tutafuta kifurushi chako {n} na kukuruhusu kuchagua mahali pa kuanzia tena. Chochote ulichoandika kitapotea."
  },
  "pricing.clear.body_other": {
    "en": "We''ll clear your {n} packages and let you pick a starting point again. Anything you''ve typed will be lost.",
    "sw": "Tutafuta vifurushi vyako {n} na kukuruhusu kuchagua mahali pa kuanzia tena. Chochote ulichoandika kitapotea."
  },
  "pricing.clear.confirm": {
    "en": "Clear and start over",
    "sw": "Futa na uanze upya"
  },
  "pricing.clear.cancel": {
    "en": "Keep my packages",
    "sw": "Baki na vifurushi vyangu"
  },
  "pricing.why.title": {
    "en": "Why we ask about pricing",
    "sw": "Kwa nini tunauliza kuhusu bei"
  },
  "pricing.why.body1": {
    "en": "Tanzanian couples typically shop by package. Bronze / Silver / Gold or by hours of coverage. Sharing your tiers helps couples self-qualify before reaching out, so the inquiries you get are more likely to convert.",
    "sw": "Wachumba wa Tanzania kwa kawaida hununua kwa vifurushi. Shaba / Fedha / Dhahabu au kwa saa za huduma. Kushiriki ngazi zako huwasaidia wachumba kujipima kabla ya kuwasiliana, hivyo maombi unayopata yana uwezekano zaidi wa kufanikiwa."
  },
  "pricing.why.body2": {
    "en": "We only show your storefront to couples whose budget reaches your starting price, and you can edit packages anytime from your dashboard.",
    "sw": "Tunaonyesha duka lako tu kwa wachumba ambao bajeti yao inafikia bei yako ya kuanzia, na unaweza kuhariri vifurushi wakati wowote kutoka dashibodi yako."
  },
  "policies.title": {
    "en": "Booking policies",
    "sw": "Sera za uhifadhi"
  },
  "policies.subtitle": {
    "en": "These show up at checkout so couples know exactly what they’re agreeing to. You can change them anytime. Existing bookings keep the policy that was active when they confirmed.",
    "sw": "Hizi huonekana wakati wa malipo ili wachumba wajue hasa wanachokubali. Unaweza kuzibadilisha wakati wowote. Uhifadhi uliopo unabaki na sera iliyokuwepo wakati wa uthibitisho."
  },
  "policies.deposit.title": {
    "en": "Deposit to confirm a booking",
    "sw": "Amana ya kuthibitisha uhifadhi"
  },
  "policies.deposit.subtitle": {
    "en": "How much of the package price couples pay upfront to lock in their date.",
    "sw": "Kiasi gani cha bei ya kifurushi wachumba hulipa awali kuhifadhi tarehe yao."
  },
  "policies.deposit.custom.label": {
    "en": "Custom percentage",
    "sw": "Asilimia maalum"
  },
  "policies.deposit.custom.placeholder": {
    "en": "e.g. 25",
    "sw": "mf. 25"
  },
  "policies.deposit.custom.error": {
    "en": "Enter a value between 5 and 100.",
    "sw": "Weka thamani kati ya 5 na 100."
  },
  "policies.cancellation.title": {
    "en": "Cancellation policy",
    "sw": "Sera ya kughairi"
  },
  "policies.cancellation.subtitle": {
    "en": "What couples get back if they cancel before the event.",
    "sw": "Wachumba hupata nini wakighairi kabla ya tukio."
  },
  "policies.reschedule.title": {
    "en": "Reschedule policy",
    "sw": "Sera ya kuratibu upya"
  },
  "policies.reschedule.subtitle": {
    "en": "What happens when a couple needs to move their date.",
    "sw": "Nini hutokea wachumba wanapohitaji kuhamisha tarehe yao."
  },
  "policies.why.title": {
    "en": "Why we ask about policies",
    "sw": "Kwa nini tunauliza kuhusu sera"
  },
  "policies.why.body1": {
    "en": "Couples want to know the rules before they pay a deposit. Vendors with clear, fair policies convert significantly better, and OpusFesta uses your policies to handle cancellations and refunds automatically. So you don''t have to argue.",
    "sw": "Wachumba wanataka kujua kanuni kabla ya kulipa amana. Watoa huduma wenye sera zilizo wazi na za haki hufanikiwa zaidi, na OpusFesta hutumia sera zako kushughulikia kughairi na marejesho kiotomatiki. Hivyo hutahitaji kubishana."
  },
  "policies.why.body2": {
    "en": "Pick the level that matches your real cancellation costs. You can always update these for new bookings, and existing bookings keep the policy they were created under.",
    "sw": "Chagua ngazi inayolingana na gharama zako halisi za kughairi. Unaweza kusasisha hizi kwa uhifadhi mpya, na uhifadhi uliopo unabaki na sera iliyoanzishwa nayo."
  },
  "payout.title": {
    "en": "Where should we send your payouts?",
    "sw": "Tukutumie malipo yako wapi?"
  },
  "payout.subtitle": {
    "en": "OpusFesta releases the deposit when a booking confirms and the balance after the event. Add one or more destinations — mobile money, Lipa Namba, or any TZ bank — and pick which one is primary.",
    "sw": "OpusFesta hutoa amana uhifadhi unapothibitishwa na salio baada ya tukio. Ongeza marudio moja au zaidi — pesa za simu, Lipa Namba, au benki yoyote ya Tanzania — na uchague lipi ni la msingi."
  },
  "payout.method_n": {
    "en": "Payout method {n}",
    "sw": "Njia ya malipo {n}"
  },
  "payout.primary": {
    "en": "Primary",
    "sw": "Ya msingi"
  },
  "payout.make_primary": {
    "en": "Make primary",
    "sw": "Fanya ya msingi"
  },
  "payout.method.label": {
    "en": "Method",
    "sw": "Njia"
  },
  "payout.method.placeholder": {
    "en": "Select a payout method",
    "sw": "Chagua njia ya malipo"
  },
  "payout.bank.label": {
    "en": "Bank",
    "sw": "Benki"
  },
  "payout.bank.placeholder": {
    "en": "Select bank",
    "sw": "Chagua benki"
  },
  "payout.network.label": {
    "en": "Network",
    "sw": "Mtandao"
  },
  "payout.network.placeholder": {
    "en": "Which provider issued this Lipa Namba?",
    "sw": "Ni mtoa huduma yupi alitoa Lipa Namba hii?"
  },
  "payout.network.hint": {
    "en": "Your Lipa Namba is registered with one of these networks. Pick whichever issued your merchant account.",
    "sw": "Lipa Namba yako imesajiliwa na mmoja wa mitandao hii. Chagua aliyetoa akaunti yako ya mfanyabiashara."
  },
  "payout.holder.label": {
    "en": "Account holder / business name",
    "sw": "Mmiliki wa akaunti / jina la biashara"
  },
  "payout.holder.placeholder": {
    "en": "As registered with your provider",
    "sw": "Kama ilivyosajiliwa na mtoa huduma wako"
  },
  "payout.holder.hint": {
    "en": "Must match the name registered with {provider}, or payouts will be rejected.",
    "sw": "Lazima lilingane na jina lililosajiliwa na {provider}, vinginevyo malipo yatakataliwa."
  },
  "payout.add_method": {
    "en": "Add another payout method",
    "sw": "Ongeza njia nyingine ya malipo"
  },
  "payout.max_reached": {
    "en": "You can add up to {max} payout methods.",
    "sw": "Unaweza kuongeza hadi njia {max} za malipo."
  },
  "payout.remove_method": {
    "en": "Remove payout method {n}",
    "sw": "Ondoa njia ya malipo {n}"
  },
  "payout.provider.bank": {
    "en": "your bank",
    "sw": "benki yako"
  },
  "payout.provider.merchant": {
    "en": "your merchant account",
    "sw": "akaunti yako ya mfanyabiashara"
  },
  "payout.provider.mobile": {
    "en": "your mobile money provider",
    "sw": "mtoa huduma wako wa pesa za simu"
  },
  "payout.number.hint": {
    "en": "Usually 5–7 digits. You''ll find it on your M-Pesa for Business / merchant statement.",
    "sw": "Kwa kawaida tarakimu 5–7. Utaipata kwenye taarifa yako ya M-Pesa for Business / ya mfanyabiashara."
  },
  "payout.why.title": {
    "en": "When and how do payouts work?",
    "sw": "Malipo hufanyaje kazi na lini?"
  },
  "payout.why.body1": {
    "en": "We hold each booking’s funds in escrow. The deposit is released to your account within 48-72 hours of the couple confirming, and the balance is released within 48-72 hours after the event.",
    "sw": "Tunashikilia fedha za kila uhifadhi katika dhamana. Amana hutolewa kwenye akaunti yako ndani ya saa 24 baada ya wachumba kuthibitisha, na salio hutolewa ndani ya saa 48 baada ya tukio."
  },
  "payout.why.body2": {
    "en": "Money goes to your primary method by default; the others are kept on file as alternates. Mobile money payouts arrive instantly. Bank transfers take 1–2 business days. We never charge a payout fee. TZS in, TZS out.",
    "sw": "Fedha huenda kwenye njia yako ya msingi kwa chaguo-msingi; nyingine huhifadhiwa kama mbadala. Malipo ya pesa za simu hufika papo hapo. Uhamisho wa benki huchukua siku 1–2 za kazi. Hatutozi ada ya malipo kamwe. TZS ndani, TZS nje."
  },
  "review.title": {
    "en": "Review your storefront",
    "sw": "Kagua duka lako"
  },
  "review.subtitle_edit": {
    "en": "Here''s everything couples will see. Update any details and save — your application status won''t change.",
    "sw": "Haya ndiyo yote wachumba watakayoona. Sasisha maelezo yoyote na uhifadhi — hali ya maombi yako haitabadilika."
  },
  "review.subtitle_new": {
    "en": "Here''s everything couples will see. Make any final edits, then submit for review.",
    "sw": "Haya ndiyo yote wachumba watakayoona. Fanya marekebisho ya mwisho, kisha wasilisha kwa ukaguzi."
  },
  "review.section.profile": {
    "en": "Profile",
    "sw": "Wasifu"
  },
  "review.section.online": {
    "en": "Online presence",
    "sw": "Uwepo mtandaoni"
  },
  "review.section.about": {
    "en": "About",
    "sw": "Kuhusu"
  },
  "review.section.style": {
    "en": "Style & personality",
    "sw": "Mtindo na tabia"
  },
  "review.section.services": {
    "en": "Special services",
    "sw": "Huduma maalum"
  },
  "review.section.packages": {
    "en": "Packages",
    "sw": "Vifurushi"
  },
  "review.section.policies": {
    "en": "Booking policies",
    "sw": "Sera za uhifadhi"
  },
  "review.section.payout": {
    "en": "Payout",
    "sw": "Malipo"
  },
  "review.row.business_name": {
    "en": "Business name",
    "sw": "Jina la biashara"
  },
  "review.row.category": {
    "en": "Category",
    "sw": "Kategoria"
  },
  "review.row.owner": {
    "en": "Owner",
    "sw": "Mmiliki"
  },
  "review.row.location": {
    "en": "Location",
    "sw": "Eneo"
  },
  "review.row.service_area": {
    "en": "Service area",
    "sw": "Eneo la huduma"
  },
  "review.row.phone": {
    "en": "Phone",
    "sw": "Simu"
  },
  "review.row.whatsapp": {
    "en": "WhatsApp",
    "sw": "WhatsApp"
  },
  "review.row.email": {
    "en": "Email",
    "sw": "Barua pepe"
  },
  "review.row.instagram": {
    "en": "Instagram",
    "sw": "Instagram"
  },
  "review.row.tiktok": {
    "en": "TikTok",
    "sw": "TikTok"
  },
  "review.row.facebook": {
    "en": "Facebook",
    "sw": "Facebook"
  },
  "review.row.website": {
    "en": "Website",
    "sw": "Tovuti"
  },
  "review.row.description": {
    "en": "Description",
    "sw": "Maelezo"
  },
  "review.row.bio": {
    "en": "About your business",
    "sw": "Kuhusu biashara yako"
  },
  "review.row.years": {
    "en": "Years in business",
    "sw": "Miaka katika biashara"
  },
  "review.row.languages": {
    "en": "Languages",
    "sw": "Lugha"
  },
  "review.row.awards": {
    "en": "Awards & recognition",
    "sw": "Tuzo na utambuzi"
  },
  "review.row.response_time": {
    "en": "Response time",
    "sw": "Muda wa kujibu"
  },
  "review.row.replies_within": {
    "en": "Replies within {time}",
    "sw": "Hujibu ndani ya {time}"
  },
  "review.row.locally_owned": {
    "en": "Locally owned",
    "sw": "Inamilikiwa na wenyeji"
  },
  "review.row.style": {
    "en": "Style",
    "sw": "Mtindo"
  },
  "review.row.personality": {
    "en": "Personality",
    "sw": "Tabia"
  },
  "review.row.deposit": {
    "en": "Deposit",
    "sw": "Amana"
  },
  "review.row.deposit_pct": {
    "en": "{pct}% to confirm",
    "sw": "Asilimia {pct} kuthibitisha"
  },
  "review.row.cancellation": {
    "en": "Cancellation",
    "sw": "Kughairi"
  },
  "review.row.reschedule": {
    "en": "Reschedule",
    "sw": "Kuratibu upya"
  },
  "review.row.method": {
    "en": "Method",
    "sw": "Njia"
  },
  "review.row.bank": {
    "en": "Bank",
    "sw": "Benki"
  },
  "review.row.network": {
    "en": "Network",
    "sw": "Mtandao"
  },
  "review.row.account_number": {
    "en": "Account number",
    "sw": "Namba ya akaunti"
  },
  "review.row.lipa_namba": {
    "en": "Lipa Namba",
    "sw": "Lipa Namba"
  },
  "review.row.number": {
    "en": "Number",
    "sw": "Namba"
  },
  "review.row.account_holder": {
    "en": "Account holder",
    "sw": "Mmiliki wa akaunti"
  },
  "review.packages.starting_from": {
    "en": "Starting from TSh {price}",
    "sw": "Kuanzia TSh {price}"
  },
  "review.packages.empty": {
    "en": "No packages added.",
    "sw": "Hakuna vifurushi vilivyoongezwa."
  },
  "review.packages.custom_quotes": {
    "en": "Custom quotes available on request.",
    "sw": "Makadirio maalum yanapatikana kwa ombi."
  },
  "review.packages.popular": {
    "en": "Popular",
    "sw": "Maarufu"
  },
  "review.packages.untitled": {
    "en": "Untitled package",
    "sw": "Kifurushi kisicho na jina"
  },
  "review.error": {
    "en": "Something went wrong submitting your application. Please check your connection and try again.",
    "sw": "Hitilafu imetokea wakati wa kuwasilisha maombi yako. Tafadhali kagua muunganisho wako na ujaribu tena."
  },
  "review.footer.save.primary": {
    "en": "Save your changes.",
    "sw": "Hifadhi mabadiliko yako."
  },
  "review.footer.save.secondary": {
    "en": "We''ll update your storefront — you''ll stay exactly where you are in the process.",
    "sw": "Tutasasisha duka lako — utabaki pale pale ulipo katika mchakato."
  },
  "review.footer.submit.primary": {
    "en": "Ready when you are.",
    "sw": "Tuko tayari ukiwa tayari."
  },
  "review.footer.submit.secondary": {
    "en": "Once you submit, we''ll ask for a couple of documents to verify your business.",
    "sw": "Ukishawasilisha, tutaomba nyaraka chache kuthibitisha biashara yako."
  },
  "review.footer.saving": {
    "en": "Saving…",
    "sw": "Inahifadhi…"
  },
  "review.footer.submitting": {
    "en": "Submitting…",
    "sw": "Inawasilisha…"
  },
  "review.footer.save_changes": {
    "en": "Save changes",
    "sw": "Hifadhi mabadiliko"
  },
  "review.footer.submit_application": {
    "en": "Submit application",
    "sw": "Wasilisha maombi"
  },
  "review.done.badge": {
    "en": "Application complete",
    "sw": "Maombi yamekamilika"
  },
  "review.done.title": {
    "en": "You''re in. Let''s verify your business.",
    "sw": "Umeingia. Tuthibitishe biashara yako."
  },
  "review.done.body": {
    "en": "Your application is submitted. A couple more documents and our team can approve your storefront. Usually 2–3 business days.",
    "sw": "Maombi yako yamewasilishwa. Nyaraka chache zaidi na timu yetu inaweza kuidhinisha duka lako. Kwa kawaida siku 2–3 za kazi."
  },
  "review.done.cta": {
    "en": "Continue to verification",
    "sw": "Endelea na uthibitishaji"
  },
  "review.done.later_prefix": {
    "en": "Or ",
    "sw": "Au "
  },
  "review.done.later_link": {
    "en": "save and continue later",
    "sw": "hifadhi na uendelee baadaye"
  },
  "review.done.later_suffix": {
    "en": ". We''ll email you a reminder.",
    "sw": ". Tutakutumia kikumbusho kwa barua pepe."
  },
  "profile.name.logo.label": {
    "en": "Logo or profile picture",
    "sw": "Nembo au picha ya wasifu"
  },
  "profile.name.logo.hint": {
    "en": "Optional. Square works best. Shown on your storefront.",
    "sw": "Hiari. Mraba huonekana vizuri zaidi. Inaonyeshwa kwenye duka lako."
  },
  "review.done.celebration_aria": {
    "en": "Celebration",
    "sw": "Sherehe"
  }
}'::jsonb,
  true
)
on conflict (page_key, section_key) do nothing;
