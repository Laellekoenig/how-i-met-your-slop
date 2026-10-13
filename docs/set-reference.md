# Set and transition references

Visual references for the sets, landmark transitions and vehicles. All sets are original procedural
interpretations; reference photos are never bundled or loaded by the app.

## Public sets

`metro_news_one`, `store`, `restaurant`, and `lecture_hall` are available to every episode,
with named marks, navigation, camera coverage, background occupants, day/night lighting, and their own exteriors.

The show-specific sets use these online visual references:

- **MacLaren's / apartment exterior**: the [on-screen pub facade](https://media.decorsed.com/file/decorsed/howimetyourmother/maclarens-pub-exterior.jpg)
  and [“Come On” episode still](https://www.imdb.com/title/tt0774239/mediaindex/).
  One shared pale-brick building has the sunken pub entrance, green railing and illuminated sign,
  with the apartment's tall stone stoop and paneled doorway beside it. An `exterior` transition to
  `maclarens` frames the pub; one to `apartment` frames the residential entrance.
  See [reference details](maclarens-reference.md#shared-pub-and-apartment-exterior).
- **Metro News One**: [Robin at the anchor desk in “Come On” (S01E22)](https://www.imdb.com/title/tt0774239/)
  ([reference still](https://m.media-amazon.com/images/M/MV5BZDM2MDFhY2MtZDUzMi00NTE4LWFmNzQtMTE5YmRmNjQ3ZmQ4XkEyXkFqcGc%40._V1_.jpg)).
  Dusk Manhattan backdrop, warm wood trim, dark desk, red mugs, and blue/yellow station branding.
- **Ted's lecture hall**: [“Definitions” classroom still in TVLine's episode gallery](https://www.tvline.com/gallery/farewell-how-i-met-your-mother-13-clue-filled-episodes-to-watch-before-the-final-season/)
  ([tiered seating](https://www.tvline.com/tvline/gallery/farewell-how-i-met-your-mother-13-clue-filled-episodes-to-watch-before-the-final-season/how-i-met-your-mother-episodes-21.jpg))
  and [Prime Video's Season 5 imagery](https://www.primevideo.com/detail/How-I-Met-Your-Mother/0P557GI6F8MMATTJJ6RFJMCRWP)
  ([chalkboard still](https://m.media-amazon.com/images/S/pv-target-images/6454f55bb1ecf5d61dc284c210a45d996a20cd9dbf223027815bfe058a434c0f.jpg)).
  Dark chalkboards, cream walls, wood paneling, a lectern, and banked student seating.
- **Lecture-hall exterior**: Columbia's Low Memorial Library, viewed from South Lawn, based on the
  supplied photograph and [Columbia's architectural reference](https://news.columbia.edu/news/six-secrets-low-library)
  and [campus photograph](https://president.columbia.edu/news/sharing-update-our-leadership-structure).
  A shallow granite dome, semicircular window, ten-column portico, Low Steps, Alma Mater, campus lamps,
  trees and students on the lawn replace the generic street frontage. The dedicated campus establishing
  shot has a gentle forward drift and day/night lighting, without the avenue's traffic or neighboring towers.

These are original procedural interpretations. Reference images are not bundled or fetched by the app;
the store, restaurant, and other destination exteriors are generic original designs.

## More locations from the show

[Location screenshots](screenshots/new-locations.jpg) · [Atlantic City transition frames](screenshots/atlantic-city-transition.jpg)

Open `/?set=maclarens_sidewalk&mute` for a silent location tour. The selector visits all five additions
and the Atlantic City arrival; the camera menu includes master/conversation/reverse wides, close-ups,
two-shots and both shoulder angles. `&time=day` switches exterior lighting. These sets are available

| Location ID | References inspected | Modeled details |
| --- | --- | --- |
| `maclarens_sidewalk` | [On-screen facade](https://media.decorsed.com/file/decorsed/howimetyourmother/maclarens-pub-exterior.jpg), [“Come On” gallery](https://www.imdb.com/title/tt0774239/mediaindex/) | Reuses the existing pale-brick facade: recessed pub entrance, green rail, frosted window, raised apartment stoop, galvanized bins, autumn tree and parking meter. Actor marks stay on the sidewalk. Opposite buildings support street-facing coverage. |
| `hoser_hut` | [“Duel Citizenship” still and context](https://www.thecurlingnews.com/news/blog/how-i-met-your-mother), [location/episode guide](https://how-i-met-your-mother.fandom.com/wiki/Hoser_Hut) | Rust brick, dark timber, left-hand bar, round red stools, hockey sweaters, maple flag, mounted antlers, small tables and karaoke corner. |
| `courtroom` | [“Twelve Horny Women” gallery](https://www.imdb.com/title/tt2445770/mediaindex/), [episode synopsis](https://tv.apple.com/gb/episode/twelve-horny-women/umc.cmc.5lencmwg6xz25i3rmf2587wjd) | Tall diamond-lattice windows, square wood paneling, brass sconces, raised judge’s bench, witness box, separate counsel tables, jury box and railed gallery. Marshall wears his work suit. |
| `atlantic_city_casino` | [CBS photo of the casino scene in “The Bro Mitzvah”](https://www.cbsnews.com/news/himym-cast-opens-up-about-the-final-season/), [“Atlantic City” episode](https://www.imdb.com/title/tt0885871/) | Burgundy patterned walls, gold pilasters and marquee bulbs, upright slots, red chairs, green Xing Hai Shi Bu Xing table, chip stacks, tiles, dealer rack and peg towers. |
| `lusty_leopard` | [“Karma” episode gallery](https://www.imdb.com/title/tt2247489/mediaindex/), [episode synopsis](https://tv.apple.com/us/episode/karma/umc.cmc.5dbvr1cv8ay01icw5pwbxybzi) | Red carpet and walls, black trim with leopard-print inlays, chrome café chairs, small round tables, brass stage rail and pole, round “Girls” neon, green-backed bar shelves, sunburst mirror and beaded curtain. |

The `atlantic_city` transition establishes the ocean, boardwalk, period casino towers and Taj Mahal-style
domes. It is automatic for new casino arrivals and time changes; repeated scenes at the same time cut directly.
An explicit `transition: "atlantic_city"` also works for a limo arriving there. Existing `skyline` and `exterior`
requests for the casino use Atlantic City geography. Opening narration plays over the arrival once, with the
same pause, skip and reduced-motion handling as other establishing shots.

The coastal composition is an original interpretation, supplemented by [Gensler’s period House of Blues / Taj Mahal
architecture photographs](https://www.gensler.com/projects/house-of-blues-atlantic-city), rather than an identified
frame-for-frame episode establishing shot. Interior dimensions and unseen reverse walls are adapted for the
puppets and camera system. All geometry and textures are procedural; reference photographs are not shipped.

## NYC transitions

`skyline` rotates through the Manhattan view and four city landmarks. Destination `exterior` shots still establish the actual building. Each landmark
has two slow camera moves, day/night lighting and animated traffic, fountain spray or water where applicable.
Layered background blocks, occasional rooftop water tanks and setbacks add city detail; slightly tighter
framing reduces empty sky while keeping the landmarks prominent.
An explicit landmark transition uses the normal narration, pause, skip and reduced-motion behavior.

Preview silently with `/?set=flatiron&time=day&mute`, changing the landmark, camera angle and lighting with
the tour controls. The playground's camera panel and scene transition selector expose the same additions.

| Transition | Visual references | Procedural interpretation |
| --- | --- | --- |
| `flatiron` | The HIMYM chapter in [The Routledge Companion to Media and the City](https://dokumen.pub/the-routledge-companion-to-media-and-the-city.html) identifies Flatiron and Washington Square in “We're Not From Here”; [NYC photograph from Baruch College](https://presidentsblog.baruch.cuny.edu/appreciate-the-complexity-around-us/) | Rounded limestone wedge, cornice bands, window rows on both faces, Broadway/23rd Street signs, crosswalk and passing yellow cabs. |
| `washington_square` | Same HIMYM chapter; [NYU's park photograph](https://www.law.nyu.edu/leadershipprogram) | White triumphal arch, circular fountain, Fifth Avenue beyond, benches, globe lamps and autumn trees. |
| `central_park` | [Bow Bridge, Central Park Conservancy](https://www.centralparknyc.org/locations/bow-bridge) | Curved cream bridge and ornamental railings, lake, rowboat, autumn banks and San Remo twin towers. A broader NYC atmosphere addition, not a claimed replica of a HIMYM frame. |
| `brooklyn_bridge` | [NYC DOT's bridge reference](https://www.nyc.gov/html/dot/html/infrastructure/brooklyn-bridge.shtml), [photograph from NYU Tandon](https://engineering.nyu.edu/academics/programs/nyu-tandon-bridge/enrolled-bridge-students) | Twin Gothic tower openings, suspension and diagonal stay cables, waterfront promenade and lit skyline. A broader NYC atmosphere addition. |

The show's street-set context also comes from production designer [Stephan Olson's HIMYM portfolio](https://www.stephanolson.com/himym).
These are original stylized sets; online photographs are reference only and are not bundled.
Both camera moves for every new landmark were checked in the muted running app, in daylight and at night.
The raycast audit checks frame coverage at 0, 2 and 4 seconds; playback tests cover opening narration for all establishing transitions.
[Saved camera audit frames](screenshots/nyc-transitions/) include both angles and lighting states.

## City interiors and period flashbacks

| Location ID | Set details |
| --- | --- |
| `subway` | NYC subway car: orange/yellow molded benches, steel grab poles, route map and sliding doors. |
| `laser_tag` | Blacklight arena: cyan/pink bases, low cover, barrels, vest rack and scoreboard. |
| `wesleyan_dorm` | **College, 1996**: Wesleyan bunks, plaid blankets, CRT computer, cassette stereo, posters, records and pizza. |
| `hospital` | Waiting room: teal chairs, magazines, reception, ward door and coffee machine. |
| `elevator` | Small walnut-and-brass cabin (about 2.7 × 2.4 m): steel doors, button panel, floor dial and handrails. |
| `canadian_mall` | **Canada, 1990**: pastel storefronts, record shop, tiled atrium, planters, Canadian flag and Robin Sparkles performance dais. |

All have named marks, connected walking routes and authored wide shots, with one-sided reverse backdrops
for dialogue coverage. Their master cameras sit near eye level with tighter framing; the subway adds
bench-and-aisle group angles, and the elevator has a compact cabin. Generated two-shots have distance
limits so conversations across a room cut to singles instead of shrinking the actors into the set.
These interiors default to direct cuts instead of an unrelated Manhattan exterior.

Visual references used for the original geometry (no reference photos are loaded by the app):

- [Ted and Marshall's college gaming still](https://whatculture.com/tv/how-i-met-your-mother-how-well-do-you-know-ted-and-marshalls-friendship?page=4): metal bunks, plaid bedding and student-room clutter.
- [College dorm still with Karen](https://www.looper.com/2037563/how-i-met-your-mother-worst-characters-ranked/): wall posters and the lower bunk as seating.
- [CBS's Robin Sparkles video](https://www.youtube.com/watch?v=9mJAsgIIfNM) and [Pamela Fryman's scene gallery](https://www.tvline.com/gallery/farewell-himym-director-pamela-fryman-relives-robin-sparkles-stinging-slaps-and-more/): pastel shops, tiled atrium and performance area.
- [R62 subway interior](https://commons.wikimedia.org/wiki/File:Interior_of_R62_Subway.jpg): orange/yellow seats, metal handrails, maps and signage.
- [“Zip, Zip, Zip” laser-tag scene](https://www.imdb.com/title/tt0606119/): fluorescent arena colors and industrial barrels.

The hospital and elevator are original generic interiors.

## Car scenes

`car` is an unbranded sedan with front bucket seats and a three-person rear bench. Cast the
`driver` explicitly (there is no automatic chauffeur), then use `front_passenger`, `back_left`,
`back_middle` and `back_right`. Each row has its own entry door; everyone stays seated.

Vehicle coverage follows [the series references and episode audit](car-reference.md):
locked windshield front-seat two-shots, rear-seat coverage, matching singles and separate driver
reactions. The limo uses dark leather and warm cabin light. Shoulder requests resolve to matching
singles from the vehicle's fixed mounts. Existing cab/limo stories keep their original locations.

Silent previews, including every camera and the day/night switch:
- [Ordinary car](http://localhost:5173/?set=car&time=day&mute)
- [Taxi](http://localhost:5173/?set=taxi&mute)
- [Limo](http://localhost:5173/?set=limo&mute)

