-- Clean existing surfaced_items.category values to the six canonical Radar
-- categories before the enum constraint is applied. Mirrors the mapping in
-- lib/radar/category.ts (normalizeRadarCategory).

-- Route real estate out of Radar entirely (held for a future dedicated surface).
UPDATE public.surfaced_items
SET destination = 'holding',
    status = CASE WHEN status = 'shown' THEN 'discovered' ELSE status END,
    category = NULL,
    updated_at = now()
WHERE lower(coalesce(category,'')) IN ('real_estate','real-estate','realestate','land','homestead');

-- moves: active things to do
UPDATE public.surfaced_items SET category = 'moves'
WHERE lower(category) IN ('outdoors','outdoor','health','fitness','wellness','sports','sport','recreation','activity','activities','workout','hike','golf','ritual');

-- style: products to acquire
UPDATE public.surfaced_items SET category = 'style'
WHERE lower(category) IN ('shopping','tops','product','products','apparel','fashion','clothing','retail','watch','watches','gear','accessory','accessories','sneakers');

-- events: ticketed + timed
UPDATE public.surfaced_items SET category = 'events'
WHERE lower(category) IN ('music','concert','concerts','show','shows','festival','festivals','game','games','nightlife','comedy','performance','gig');

-- culture: drop-in + ongoing art/intellectual
UPDATE public.surfaced_items SET category = 'culture'
WHERE lower(category) IN ('cultural','art','arts','gallery','galleries','museum','exhibit','exhibition','reading','lecture','opening','literary','film','cinema','theater','theatre');

-- dining: food & drink
UPDATE public.surfaced_items SET category = 'dining'
WHERE lower(category) IN ('restaurant','restaurants','food','bar','bars','cafe','coffee','lounge','brunch','dinner','cuisine','cocktails','mexican','japanese','italian','mediterranean','steak','steakhouse','sushi','french');

-- places: non-food spots / atmosphere
UPDATE public.surfaced_items SET category = 'places'
WHERE lower(category) IN ('place','places','park','parks','shop','venue','view','spa','hotel','cigar','garden','neighborhood','boutique');

-- general / anything still non-canonical → NULL (dropped from category; not surfaced dirty)
UPDATE public.surfaced_items SET category = NULL
WHERE category IS NOT NULL
  AND category NOT IN ('moves','events','culture','dining','places','style');
