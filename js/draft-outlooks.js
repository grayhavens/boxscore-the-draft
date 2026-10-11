/* ============================================================
   Season outlooks for the draft room's team sheet (js/draft.js), one to
   three sentences per pool team, keyed by draft class (NEXT_DRAFT_YEAR)
   and then by pool id (js/draft-pool.js). Draft room only: they're
   written for draft day and not kept up after it, so nothing outside
   the room (team cards, the team modal) should read them.

   Written from each team's ESPN facts plus current news, and merged in
   with tools/outlooks.mjs (see its header). Edit any line that's wrong;
   a later merge only replaces the teams it includes. A team with no
   outlook for the class being drafted gets a sentence built from its
   numbers instead (scoutSummary in js/draft-scout.js), so an old class's
   outlook is never shown as this year's.
   ============================================================ */
export const DRAFT_OUTLOOKS = {
  "2026": {
    "cfb_alabama": {
      "text": "Lost 20-17 at Georgia when a late personal foul sealed it, their first loss. Still a likely CFP team (+2) in a crowded SEC, but they've lost the head-to-head with the conference favorite.",
      "at": "2026-10-11"
    },
    "cfb_arizona": {
      "text": "5-1 after a nine-win season. A likely bowl team and a Big 12 dark horse.",
      "at": "2026-10-11"
    },
    "cfb_arizona_state": {
      "text": "2-2 and unranked. A likely bowl team in the middle of the Big 12.",
      "at": "2026-10-11"
    },
    "cfb_auburn": {
      "text": "3-2 after a 5-7 year with only one SEC win. A bowl is possible, but last place in the SEC (-3) is also in play.",
      "at": "2026-10-11"
    },
    "cfb_boise_state": {
      "text": "4-1 and ranked 23rd, usually the class of its conference. A likely bowl team with a real shot at the CFP's Group of Five spot (+2).",
      "at": "2026-10-11"
    },
    "cfb_byu": {
      "text": "Unbeaten and eighth in the AP poll after a 12-2 season. A leading Big 12 contender (+2) and a realistic CFP candidate.",
      "at": "2026-10-11"
    },
    "cfb_clemson": {
      "text": "3-2 and unranked after a 7-6 year. A bowl team, but not an ACC contender with Miami unbeaten.",
      "at": "2026-10-11"
    },
    "cfb_florida": {
      "text": "Was 4-0 and eighth in the AP poll, but has now lost two straight, the latest a home blowout by South Carolina. A bowl is still likely after last year's 4-8; the CFP has slipped away.",
      "at": "2026-10-11"
    },
    "cfb_florida_state": {
      "text": "3-3 after a 5-7 year. Making a bowl is a toss-up; missing one costs -2.",
      "at": "2026-10-11"
    },
    "cfb_georgia": {
      "text": "Held off Alabama 20-17 on a late field goal to stay unbeaten and should take over No. 1. The SEC favorite and a strong bet for the CFP (+2) and a deep run.",
      "at": "2026-10-11"
    },
    "cfb_houston": {
      "text": "5-1 and ranked in the low 20s after a 10-win season. A likely bowl team and a Big 12 dark horse.",
      "at": "2026-10-11"
    },
    "cfb_illinois": {
      "text": "3-3, including a loss to Ohio State, after a nine-win season. A bowl is realistic; missing one (-2) is the downside.",
      "at": "2026-10-11"
    },
    "cfb_indiana": {
      "text": "The undefeated defending champions rallied from 11 down in the fourth quarter to beat Nebraska and stay perfect. Another CFP trip (+2) is realistic; the Big Ten title (+2) likely means beating Ohio State.",
      "at": "2026-10-11"
    },
    "cfb_iowa": {
      "text": "5-1 and ranked around 20th. A dependable bowl team; the Big Ten title is a long shot with Ohio State and Indiana above them.",
      "at": "2026-10-11"
    },
    "cfb_iowa_state": {
      "text": "3-3 after missing a bowl last year. A bowl bid is a coin flip in the Big 12, and missing one costs -2.",
      "at": "2026-10-11"
    },
    "cfb_james_madison": {
      "text": "6-0 and the Sun Belt favorite after a CFP trip last year. A strong bet for conference title points (+2) and a real shot at the CFP again.",
      "at": "2026-10-11"
    },
    "cfb_kansas_state": {
      "text": "3-2 after a 6-6 year. Likely a bowl team in the middle of the Big 12.",
      "at": "2026-10-11"
    },
    "cfb_kentucky": {
      "text": "Beat LSU in overtime for a second straight OT win, with quarterback Kenny Minchey running in the winning two-point try. Ranked in the coaches poll; a bowl looks likely after missing one last year.",
      "at": "2026-10-11"
    },
    "cfb_liberty": {
      "text": "5-1 after a 4-8 year, and the Conference USA favorite. A bowl looks likely, with a real shot at the conference title (+2).",
      "at": "2026-10-11"
    },
    "cfb_louisville": {
      "text": "3-3 after a nine-win year. Likely a bowl team in the ACC's middle tier, though not a safe one.",
      "at": "2026-10-11"
    },
    "cfb_lsu": {
      "text": "Lost in overtime at Kentucky on a two-point conversion, their second loss. A bowl looks safe after last year's 7-6, but the CFP now depends on winning most of a brutal SEC slate.",
      "at": "2026-10-11"
    },
    "cfb_memphis": {
      "text": "5-1 and one of the American's leading contenders. A likely bowl team with conference-title upside (+2).",
      "at": "2026-10-11"
    },
    "cfb_miami": {
      "text": "Last year's national runners-up are unbeaten and fourth in the AP poll, the clear class of the ACC. Conference title (+2) and CFP points look very likely.",
      "at": "2026-10-11"
    },
    "cfb_michigan": {
      "text": "3-2 and outside the rankings after a 9-4 year. A bowl team again, with only a slim Big Ten title shot.",
      "at": "2026-10-11"
    },
    "cfb_missouri": {
      "text": "5-1 and up to 14th in the AP poll. A likely bowl team, though the SEC title is out of reach.",
      "at": "2026-10-11"
    },
    "cfb_navy": {
      "text": "2-3 after an 11-win season. A bowl is still possible, but the American title looks out of reach and missing one costs -2.",
      "at": "2026-10-11"
    },
    "cfb_ndsu": {
      "text": "An FCS powerhouse that plays outside the FBS bowl system and the CFP. It can't earn the usual bowl, conference or playoff points, so its value depends on how your league scores FCS teams.",
      "at": "2026-10-11"
    },
    "cfb_nebraska": {
      "text": "Led Indiana by 11 in the fourth quarter before losing 20-17, their first loss. A bowl looks very likely; the Big Ten title doesn't.",
      "at": "2026-10-11"
    },
    "cfb_new_mexico": {
      "text": "4-1 and among the Mountain West favorites. A good bet for a bowl and a real shot at the conference title (+2).",
      "at": "2026-10-11"
    },
    "cfb_notre_dame": {
      "text": "6-0 and third in the AP poll. As an independent there's no conference title to chase, but a CFP spot (+2) looks likely after missing out last year.",
      "at": "2026-10-11"
    },
    "cfb_ohio_state": {
      "text": "Ranked fifth after an early loss, but still the deepest roster in the Big Ten and the conference favorite. A strong bet for the CFP (+2), with semifinal and title-game upside.",
      "at": "2026-10-11"
    },
    "cfb_oklahoma": {
      "text": "Beat No. 1 Texas on a walk-off field goal after a shaky 2-2 start. Last year's CFP team is back in the conversation; a bowl looks likely, the CFP possible with a strong finish.",
      "at": "2026-10-11"
    },
    "cfb_ole_miss": {
      "text": "Last year's CFP semifinalists are 4-1 and in the top ten. Should be in the CFP mix again, though the SEC title is a long shot with Georgia rolling.",
      "at": "2026-10-11"
    },
    "cfb_oregon": {
      "text": "Lost at home to UCLA after six turnovers and a failed late two-point try, their second loss already. Last year's CFP semifinalists now need help in the Big Ten race; a bowl is safe, the CFP (+2) far from it.",
      "at": "2026-10-11"
    },
    "cfb_penn_state": {
      "text": "3-3 after a road loss to USC, following a 7-6 year. A bowl is still realistic, but the Big Ten title is out of reach and missing a bowl (-2) is a real risk.",
      "at": "2026-10-11"
    },
    "cfb_smu": {
      "text": "4-1 and ranked in the low 20s. A solid bet for a bowl; an ACC title run would have to go through Miami.",
      "at": "2026-10-11"
    },
    "cfb_south_carolina": {
      "text": "Blew out Florida on the road, a big result after a 4-8 year with one SEC win. A bowl is back in play, but last place in the SEC (-3) remains a risk.",
      "at": "2026-10-11"
    },
    "cfb_tcu": {
      "text": "2-3 after a nine-win year. A bowl is now a coin flip; missing one costs -2.",
      "at": "2026-10-11"
    },
    "cfb_tennessee": {
      "text": "5-1 and 15th in the AP poll. A likely bowl team with an outside CFP shot in a deep SEC.",
      "at": "2026-10-11"
    },
    "cfb_texas": {
      "text": "Lost the No. 1 ranking on a last-second field goal against Oklahoma after two late Arch Manning interceptions. One loss doesn't end anything: still a strong CFP candidate, though the SEC title (+2) now likely runs through Georgia.",
      "at": "2026-10-11"
    },
    "cfb_texas_a_and_m": {
      "text": "A CFP team last year, now 3-3 and unranked. A bowl is still realistic; the CFP looks out of reach and missing a bowl (-2) is no longer unthinkable.",
      "at": "2026-10-11"
    },
    "cfb_texas_tech": {
      "text": "Unbeaten and in the top 11 after a CFP trip last year. A strong bet for Big 12 title (+2) and CFP points.",
      "at": "2026-10-11"
    },
    "cfb_toledo": {
      "text": "4-2 and a leading MAC contender. A bowl is likely, with conference-title upside.",
      "at": "2026-10-11"
    },
    "cfb_usc": {
      "text": "Won at Penn State to reach 6-1 and stay in the playoff picture. Bowl points look safe; the Big Ten title is a long shot.",
      "at": "2026-10-11"
    },
    "cfb_utah": {
      "text": "Beat Kansas 41-24 to stay unbeaten, and ranked 12th. A leading Big 12 contender (+2); a conference title would bring a CFP spot.",
      "at": "2026-10-11"
    },
    "cfb_virginia": {
      "text": "4-2 after an 11-win season. A likely bowl team and an ACC dark horse.",
      "at": "2026-10-11"
    },
    "cfb_virginia_tech": {
      "text": "4-2 after a 3-9 season. A bowl looks likely now, which avoids the -2, and they're an ACC dark horse.",
      "at": "2026-10-11"
    },
    "cfb_washington": {
      "text": "3-3 after a nine-win year. A bowl is realistic in the Big Ten's middle, but not guaranteed.",
      "at": "2026-10-11"
    },
    "cfb_western_michigan": {
      "text": "4-2 after a 10-win season and the MAC favorite. A good bet for a bowl and a real conference-title shot (+2).",
      "at": "2026-10-11"
    },
    "cfb_wisconsin": {
      "text": "4-1 after a 4-8 year. A bowl is realistic this time, which avoids the -2.",
      "at": "2026-10-11"
    },
    "epl_afc_bournemouth": {
      "text": "Marco Rose's side is winless after six and sits 17th, though the margins in their games have been tight. Getting Junior Kroupi back should help; after last year's sixth place, staying clear of the bottom three is now the first job.",
      "at": "2026-10-11"
    },
    "epl_arsenal": {
      "text": "The champions went into the break second after their first loss, to Brighton, and Bruno Guimarães has settled in midfield. With City's guilty verdict hanging over the race, Arsenal are the steadiest bet for a top-two finish (+6 or +9) and Champions League points (+4).",
      "at": "2026-10-11"
    },
    "epl_aston_villa": {
      "text": "Needed five tries for a first league win after losing key midfielders and defenders, and sit 14th. Unai Emery has a record of fixing slow starts, but repeating last season's Champions League finish looks unlikely; a Europa push (+3) is the realistic ceiling.",
      "at": "2026-10-11"
    },
    "epl_brentford": {
      "text": "Unbeaten after six, with wins over Tottenham and Chelsea and four draws, and fourth in the table. Keith Andrews has kept one of the league's most stable clubs on track; a top-half finish with an outside shot at Europe is the range.",
      "at": "2026-10-11"
    },
    "epl_brighton": {
      "text": "Third after beating Arsenal before the break. Fabian Hürzeler's young, inventive side has started better than almost anyone, though European football will stretch the squad. A top-half finish and a run at Europe (+3) look realistic.",
      "at": "2026-10-11"
    },
    "epl_chelsea": {
      "text": "Xabi Alonso's side is fifth but inconsistent, and injuries to Cole Palmer and João Pedro have left them short of goals. Getting both back fit is the swing factor for a Champions League (+4) or Europa League (+3) place.",
      "at": "2026-10-11"
    },
    "epl_coventry_city": {
      "text": "Frank Lampard's side won at Nottingham Forest for its first top-flight win in 25 years, but has lost the other four. One of the likeliest sides to go straight back down (-5), with Haji Wright's goals their best hope.",
      "at": "2026-10-11"
    },
    "epl_crystal_palace": {
      "text": "Summer sales and Oliver Glasner's exit left Pierre Sage a much thinner squad, with Adam Wharton the standout. One win in five while also playing in Europe; a relegation fight is a real possibility.",
      "at": "2026-10-11"
    },
    "epl_everton": {
      "text": "Unbeaten at two wins and three draws under David Moyes, with summer additions like Christian Nørgaard and Brennan Johnson adding depth. Settled midtable is the expectation, with little risk of the drop.",
      "at": "2026-10-11"
    },
    "epl_fulham": {
      "text": "Bottom of the table without a win in six, and pressure is already building on Álvaro Arbeloa in his first season after Marco Silva. Unless things turn quickly, a relegation fight (-5) is the likeliest story.",
      "at": "2026-10-11"
    },
    "epl_hull_city": {
      "text": "Two wins in five under Sergej Jakirović is better than previews predicted for the weakest-looking promoted side. Most expect them to fade, so relegation (-5) remains the main risk.",
      "at": "2026-10-11"
    },
    "epl_ipswich_town": {
      "text": "Three wins from six under Gary O'Neil is a solid start for a promoted side, though the results have outrun the performances. Survival is far from assured, and relegation costs -5.",
      "at": "2026-10-11"
    },
    "epl_leeds_united": {
      "text": "Sixth and one of the league's most organized sides, with new centre back Tarik Muharemovic and goalkeeper James Trafford shoring up the back. Daniel Farke's team looks safe, with a top-half finish within reach.",
      "at": "2026-10-11"
    },
    "epl_liverpool": {
      "text": "Unbeaten under Andoni Iraola, but three draws in five show a cautious side still finding goals after Mohamed Salah's exit. Alexander Isak and Florian Wirtz lead the attack. A top-four return (+4) is realistic; a title push is a stretch.",
      "at": "2026-10-11"
    },
    "epl_manchester_city": {
      "text": "Five wins from five under Enzo Maresca, with Erling Haaland scoring freely. The catch: a panel found City guilty on 114 of the 115 financial charges, and the sanction, possibly a points deduction, is still to come. On the pitch they're title contenders (+9); off it, a real wild card.",
      "at": "2026-10-11"
    },
    "epl_manchester_united": {
      "text": "Third last season, but one win from six has them 12th, and Michael Carrick's side looks a long way from last year's form. They still have the squad to climb toward the European places, but a top-three repeat (+3) has to be earned.",
      "at": "2026-10-11"
    },
    "epl_newcastle": {
      "text": "Eight points from five is a decent return given the summer exits of Sandro Tonali, Bruno Guimarães and Anthony Gordon, plus several injuries. Matthias Jaissle has them organized; midtable with an outside shot at Europe is the range.",
      "at": "2026-10-11"
    },
    "epl_nottingham": {
      "text": "Oliver Glasner's side is competent but inconsistent, with one win in five, and lost at home to promoted Coventry. After a 16th-place scare last year, midtable is the likeliest outcome, with relegation a smaller risk than last season.",
      "at": "2026-10-11"
    },
    "epl_sunderland": {
      "text": "Earned a Europa League place by finishing seventh, but one win in six has them 16th. Their underlying numbers are better than the results, so Régis Le Bris's side should climb, though another European finish is unlikely.",
      "at": "2026-10-11"
    },
    "epl_tottenham_hotspur": {
      "text": "Winless in six league games and in the bottom three under Roberto De Zerbi, after finishing 17th last season. A League Cup rout is the lone bright spot. The squad lacks attacking punch, and relegation (-5) is a genuine risk.",
      "at": "2026-10-11"
    },
    "mcbb_alabama": {
      "text": "Aden Holloway's drug charge was dismissed and he returns after a two-game suspension; Amari Allen is a projected first-rounder. No. 21 in ESPN's rankings; a likely tournament team.",
      "at": "2026-10-11"
    },
    "mcbb_arizona": {
      "text": "A 36-3 Final Four team that returns Motiejus Krivas and Ivan Kharchenkov and adds five-star Caleb Holt. Fourth in ESPN's rankings, with Tommy Lloyd's best defense yet; a strong Big 12 contender (+3).",
      "at": "2026-10-11"
    },
    "mcbb_arkansas": {
      "text": "Brings in the nation's top recruiting class, led by lottery prospect Jordan Smith and three other five-stars, around Billy Richmond III. Ranked 7th by CBS and 12th by ESPN; a likely tournament team with Elite Eight (+2) upside.",
      "at": "2026-10-11"
    },
    "mcbb_auburn": {
      "text": "Won the NIT after a 7-11 SEC season, then lost Keyshawn Hall to St. John's and Elyjah Freeman to Texas. Outside the preseason rankings; missing the tournament (-2) is a real risk.",
      "at": "2026-10-11"
    },
    "mcbb_baylor": {
      "text": "17-17 and 6-12 in the Big 12, and lost Tounde Yessoufou to St. John's. Bubble at best; last place in the conference (-3) is a risk.",
      "at": "2026-10-11"
    },
    "mcbb_byu": {
      "text": "Lost AJ Dybantsa to the NBA, but Robert Wright III is back and top-10 recruit Bruce Branch III arrives. No. 20 in ESPN's rankings; should make the tournament after a 9-9 Big 12 year.",
      "at": "2026-10-11"
    },
    "mcbb_cincinnati": {
      "text": "18-15 and missed the tournament, then lost Moustapha Thiam to Michigan. A bubble team at best in the Big 12.",
      "at": "2026-10-11"
    },
    "mcbb_creighton": {
      "text": "16-18 and a sub-.500 Big East team. Likely to miss the tournament (-2) unless the rebuild clicks fast.",
      "at": "2026-10-11"
    },
    "mcbb_duke": {
      "text": "No. 2 in both ESPN's and CBS's preseason rankings after going 35-3. Patrick Ngongba II, Caleb Foster and Cayden Boozer return, and Wisconsin transfer John Blackwell joins. ACC regular-season points (+3) look likely again, with a deep March run in reach.",
      "at": "2026-10-11"
    },
    "mcbb_florida": {
      "text": "No. 1 in both ESPN's and CBS's preseason rankings, bringing back Thomas Haugh, Alex Condon, Rueben Chinyelu and Boogie Fland. A strong bet for the SEC regular-season title (+3) and a deep March run.",
      "at": "2026-10-11"
    },
    "mcbb_georgia": {
      "text": "A 22-win first-round team that lost Somto Cyril to Miami and Jeremiah Wilkinson to Arkansas. A bubble team in the SEC; missing the tournament (-2) is possible.",
      "at": "2026-10-11"
    },
    "mcbb_gonzaga": {
      "text": "Braden Huff and Arizona State transfer Massamba Diop give them a strong frontcourt, but three backcourt transfers are waiting on eligibility. Ranked 8th by CBS and 14th by ESPN; a favorite in the rebuilt Pac-12, where conference titles pay well.",
      "at": "2026-10-11"
    },
    "mcbb_houston": {
      "text": "Lost its top four scorers, so Kelvin Sampson leans on Joseph Tugler, LSU transfer Dedan Thomas Jr. and Kent State's Delrecco Gillespie. Ranked 18th by ESPN; still a safe tournament bet, though less of a Big 12 favorite than usual.",
      "at": "2026-10-11"
    },
    "mcbb_illinois": {
      "text": "Last year's Final Four team returns David Mirkovic, Andrej Stojakovic and both Ivisic twins, adding Providence's Stefan Vaaks. Third in ESPN's rankings, fourth in CBS's; a Big Ten title contender (+3).",
      "at": "2026-10-11"
    },
    "mcbb_indiana": {
      "text": "Missed the postseason last year, but CBS has them just outside its preseason Top 25. A tournament return (+1) is realistic, which would also avoid the -2.",
      "at": "2026-10-11"
    },
    "mcbb_iowa_state": {
      "text": "Just outside ESPN's preseason Top 25 after a Sweet 16 run. A dependable tournament team in the Big 12.",
      "at": "2026-10-11"
    },
    "mcbb_kansas": {
      "text": "Adds Tyran Stokes, the No. 1 recruit, plus Taylen Kinney, and Melvin Council Jr. and Tre White were cleared for a fifth year. Lost Flory Bidunga to Louisville. No. 19 in ESPN's rankings; a tournament team with upside.",
      "at": "2026-10-11"
    },
    "mcbb_kentucky": {
      "text": "Added Iowa State transfer Milan Momcilovic, maybe the country's best shooter, plus Zoom Diallo, but Malachi Moreno has to take a step. No. 25 in ESPN's rankings; a likely tournament team, though the SEC title looks like a stretch.",
      "at": "2026-10-11"
    },
    "mcbb_louisville": {
      "text": "Loaded up on transfers, including Flory Bidunga, Jackson Shelstad and Karter Knox, plus five-star big Obinna Ekezie. No. 15 in ESPN's rankings; a strong tournament bet and an ACC contender.",
      "at": "2026-10-11"
    },
    "mcbb_marquette": {
      "text": "12-20 and 7-13 in the Big East. Likely to miss the tournament (-2); last in the conference (-3) is in play.",
      "at": "2026-10-11"
    },
    "mcbb_memphis": {
      "text": "13-19 and missed the postseason. A rebuild year; missing the tournament (-2) is likely.",
      "at": "2026-10-11"
    },
    "mcbb_miami": {
      "text": "Malik Reneau is waiting on a fifth year, and Villanova's Acaden Lewis and Georgia's Somto Cyril join five-star Caleb Gaskins. No. 11 in ESPN's rankings; a likely tournament team in the ACC.",
      "at": "2026-10-11"
    },
    "mcbb_mich_state": {
      "text": "Jeremy Fears Jr. is a national player of the year favorite, with Coen Carr back too. Sixth in both ESPN's and CBS's rankings; a likely tournament team and a Big Ten contender.",
      "at": "2026-10-11"
    },
    "mcbb_michigan": {
      "text": "The defending champions have a new coach, Mike Boynton, after Dusty May left, and five-star recruit Brandon McCoy tore his ACL. Elliot Cadeau and Trey McKenney return; ranked 3rd by CBS but 22nd by ESPN.",
      "at": "2026-10-11"
    },
    "mcbb_missouri": {
      "text": "Five-star Jason Crowe Jr. headlines a big portal and freshman haul around Trent Pierce, though Mark Mitchell's fifth year is pending. No. 16 in ESPN's rankings; a likely tournament team.",
      "at": "2026-10-11"
    },
    "mcbb_ndsu": {
      "text": "27-8 and 14-2 in the Summit League, then a first-round loss. Conference titles (+3, +2) are its path to points; a tournament bid depends on winning the Summit.",
      "at": "2026-10-11"
    },
    "mcbb_nebraska": {
      "text": "A 28-7 Sweet 16 team, just outside ESPN's preseason Top 25. Likely back in the tournament, though the Big Ten title is a long shot.",
      "at": "2026-10-11"
    },
    "mcbb_north_carolina": {
      "text": "Just outside ESPN's and CBS's preseason Top 25 after a first-round exit, and lost Seth Trimble to Louisville and Derek Dixon to Arizona. A likely tournament team, but not an ACC favorite.",
      "at": "2026-10-11"
    },
    "mcbb_ohio_state": {
      "text": "A 21-win first-round team. Likely a bubble team in the Big Ten.",
      "at": "2026-10-11"
    },
    "mcbb_oregon": {
      "text": "12-20 and 5-15 in the Big Ten, then lost Jackson Shelstad to Louisville. Strong candidate to miss the tournament (-2) and finish near the bottom of the conference (-3).",
      "at": "2026-10-11"
    },
    "mcbb_purdue": {
      "text": "An Elite Eight team that returns C.J. Cox among five of its top nine scorers. Just outside ESPN's preseason Top 25; a dependable tournament team.",
      "at": "2026-10-11"
    },
    "mcbb_saint_mary_s": {
      "text": "27-6 and 16-2 in conference, but lost Mikey Lewis to Texas. With Gonzaga gone to the Pac-12, they're a leading WCC contender, and conference titles are where the points are.",
      "at": "2026-10-11"
    },
    "mcbb_san_diego_state": {
      "text": "22-11 but missed the tournament. A bubble team in the new Pac-12.",
      "at": "2026-10-11"
    },
    "mcbb_slu": {
      "text": "29-6 and a second-round team. A contender for the Atlantic 10 titles, which is where the points are.",
      "at": "2026-10-11"
    },
    "mcbb_st_johns": {
      "text": "Went 18-2 in the Big East and adds Baylor transfer Tounde Yessoufou to Ian Jackson, but Keyshawn Hall and two others are waiting on eligibility. No. 10 in ESPN's rankings; a strong Big East contender.",
      "at": "2026-10-11"
    },
    "mcbb_tennessee": {
      "text": "Rebuilt through the portal around DeWayne Brown II, adding Juke Harris, Terrence Hill Jr., Jalen Haralson and more after an Elite Eight run. Eighth in ESPN's preseason rankings; a likely tournament team with Elite Eight (+2) upside.",
      "at": "2026-10-11"
    },
    "mcbb_texas": {
      "text": "Returns top scorer Matas Vokietaitis and adds five-star Marcus Spears Jr. and five transfers, though Mikey Lewis has a foot injury. Ranked 7th by ESPN and 9th by CBS; a big step up from last year's 9-9 SEC record is expected.",
      "at": "2026-10-11"
    },
    "mcbb_texas_a_and_m": {
      "text": "A 22-win second-round team. A bubble-to-tournament team in a deep SEC.",
      "at": "2026-10-11"
    },
    "mcbb_texas_tech": {
      "text": "JT Toppin is an All-American if healthy, and three key newcomers are awaiting eligibility rulings. Ninth in ESPN's rankings; likely back in the tournament, with a Big 12 title possible if the pieces clear.",
      "at": "2026-10-11"
    },
    "mcbb_ucla": {
      "text": "Returns Trent Perry, Eric Dailey Jr. and Xavier Booker, and adds Texas Tech's Jaylen Petty. No. 24 in ESPN's rankings; a solid tournament bet in the Big Ten.",
      "at": "2026-10-11"
    },
    "mcbb_uconn": {
      "text": "Last year's national runners-up return Silas Demary Jr., Braylon Mullins and Jayden Ross, and added Duke's Nik Khamenia. Fifth in both ESPN's and CBS's rankings; a strong Big East regular-season bet (+3).",
      "at": "2026-10-11"
    },
    "mcbb_utah_state": {
      "text": "29-7 and a second-round team. A contender for its conference titles in the new Pac-12, which is where the points are.",
      "at": "2026-10-11"
    },
    "mcbb_vanderbilt": {
      "text": "Point guard Tyler Tanner is a Wooden Award contender, and a deep portal class joins him. No. 23 in ESPN's rankings; a likely tournament team in a deep SEC.",
      "at": "2026-10-11"
    },
    "mcbb_villanova": {
      "text": "A 24-win tournament team that went 15-5 in the Big East, though it lost Acaden Lewis to Miami. Just outside ESPN's Top 25; likely back in the tournament.",
      "at": "2026-10-11"
    },
    "mcbb_virginia": {
      "text": "A 30-6 team that returns Thijs De Ridder, Sam Lewis, Johann Grunloh and point guard Chance Mallory. No. 13 in ESPN's rankings; an ACC title contender behind Duke.",
      "at": "2026-10-11"
    },
    "mcbb_wisconsin": {
      "text": "A 24-win tournament team that fell in the first round, then lost John Blackwell to Duke. Likely on the bubble in the Big Ten.",
      "at": "2026-10-11"
    },
    "mcbb_xavier": {
      "text": "15-18 and 6-14 in the Big East. Likely to miss the tournament (-2), with last place (-3) a risk.",
      "at": "2026-10-11"
    },
    "mlb_angels": {
      "text": "62-100, last in the AL West. One of the likeliest teams to finish last again (-2) and contend for the AL's worst record (-3).",
      "at": "2026-10-11"
    },
    "mlb_astros": {
      "text": "Won the AL West at just 81-81, then went out in the wild-card round. An aging core in a division where Seattle and Texas should improve; repeating as division champs is far from certain.",
      "at": "2026-10-11"
    },
    "mlb_athletics": {
      "text": "64-98, fourth in the AL West. Still years from contention; last place in the division (-2) and the AL's worst record (-3) are both in play.",
      "at": "2026-10-11"
    },
    "mlb_blue_jays": {
      "text": "Slipped to 79-83 and last in the AL East after recent World Series runs. Vladimir Guerrero Jr. anchors a team with a history of spending, and previews expect a bounce-back in 2027.",
      "at": "2026-10-11"
    },
    "mlb_braves": {
      "text": "Won the NL East at 94-68 before the Dodgers knocked them out in the NLDS. The core is intact and they're linked to free agent Randy Arozarena; a solid bet for playoff and division points in 2027.",
      "at": "2026-10-11"
    },
    "mlb_brewers": {
      "text": "Won 103 games and the NL Central, then beat San Diego to reach the NLCS against the Dodgers again. Jacob Misiorowski leads a deep staff; a strong bet to contend for the NL's best record (+3) in 2027.",
      "at": "2026-10-11"
    },
    "mlb_cardinals": {
      "text": "77-85, but a young roster that outplayed expectations; previews think one more starting pitcher could make them an NL Central contender in 2027.",
      "at": "2026-10-11"
    },
    "mlb_cubs": {
      "text": "An 89-win wild-card team with Pete Crow-Armstrong emerging as a star, but Seiya Suzuki is one of the best hitters on the free-agent market. Should contend again in 2027, likely behind Milwaukee in the NL Central.",
      "at": "2026-10-11"
    },
    "mlb_diamondbacks": {
      "text": "86 wins but missed the playoffs in a strong NL West. A fringe contender for 2027; a wild card is realistic, the division is not.",
      "at": "2026-10-11"
    },
    "mlb_dodgers": {
      "text": "The two-time defending champions won 100 games, beat Atlanta in the NLDS and face Milwaukee in the NLCS again. Tarik Skubal is the top free agent this winter, but the Dodgers always reload; the NL West (+2) and a deep October run are the 2027 baseline.",
      "at": "2026-10-11"
    },
    "mlb_giants": {
      "text": "65-97 and fourth in the NL West. A long rebuild ahead; a leading candidate for last in the division (-2) if Colorado improves at all.",
      "at": "2026-10-11"
    },
    "mlb_guardians": {
      "text": "Won a weak AL Central at 85-77, beat the White Sox in a five-game ALDS and now face Tampa Bay in the ALCS. Division repeats are their habit, but the White Sox and Royals are closing in.",
      "at": "2026-10-11"
    },
    "mlb_mariners": {
      "text": "A disappointing 76-86, and Randy Arozarena, coming off a career-best year, is a top free agent likely to leave. Julio Rodríguez, Cal Raleigh and deep pitching still point to a bounce-back in 2027.",
      "at": "2026-10-11"
    },
    "mlb_marlins": {
      "text": "80-82, third in the NL East behind Atlanta and Philadelphia. Likely a middle-of-the-pack team in 2027; a playoff spot would be a surprise.",
      "at": "2026-10-11"
    },
    "mlb_mets": {
      "text": "A disappointing 74-88 and last in the NL East despite star power. Expect a big offseason spend; a bounce-back into the wild-card race is realistic, but last place (-2) happened once already.",
      "at": "2026-10-11"
    },
    "mlb_nationals": {
      "text": "77-85, fourth in the NL East. Still building; a 2027 playoff push is unlikely, but last place isn't a given with the Mets below them this year.",
      "at": "2026-10-11"
    },
    "mlb_orioles": {
      "text": "79-82 and fourth in the AL East, and Trevor Rogers, one of the top pitchers on the market, is a free agent. Another big winter around Pete Alonso could make them a 2027 contender.",
      "at": "2026-10-11"
    },
    "mlb_padres": {
      "text": "A 91-win team that lost to Milwaukee in the NLDS. Michael King and reliever Adrián Morejón are both free agents, which could thin the pitching; likely a wild-card team again behind the Dodgers.",
      "at": "2026-10-11"
    },
    "mlb_phillies": {
      "text": "88 wins and a wild-card exit, second to Atlanta in the NL East. An experienced, expensive roster that should stay a playoff contender in 2027, though the core is getting older.",
      "at": "2026-10-11"
    },
    "mlb_pirates": {
      "text": "82-80 for a rare winning season, but Brandon Lowe, coming off a career year, is a free agent. A fringe wild-card team for 2027.",
      "at": "2026-10-11"
    },
    "mlb_rangers": {
      "text": "80-82 and second in a weak AL West. With the Astros aging, the division is open, so they're a reasonable division-title sleeper for 2027.",
      "at": "2026-10-11"
    },
    "mlb_rays": {
      "text": "Won the AL East at 98-64 behind Junior Caminero's 40 homers, swept the Yankees and are in the ALCS. Freddy Peralta is a free agent, but the young core makes them a good bet for the playoffs again.",
      "at": "2026-10-11"
    },
    "mlb_red_sox": {
      "text": "An 87-win wild-card team in a strong AL East. Should contend for the playoffs again in 2027, with the division a long shot behind Tampa Bay and New York.",
      "at": "2026-10-11"
    },
    "mlb_reds": {
      "text": "75-87 and last in the NL Central. Young pitching gives them upside, but last place in the division (-2) is a real risk again.",
      "at": "2026-10-11"
    },
    "mlb_rockies": {
      "text": "58-104, the worst record in baseball. The clear favorite for last in the NL West (-2) and the NL's worst record (-3) again.",
      "at": "2026-10-11"
    },
    "mlb_royals": {
      "text": "69-93 and last in the AL Central, but Bobby Witt Jr. is an MVP-level star. Previews think added outfield bats could make them a 2027 surprise; another last place (-2) is the risk.",
      "at": "2026-10-11"
    },
    "mlb_tigers": {
      "text": "76-86 and fourth in the AL Central after trading Tarik Skubal. A middle-of-the-pack team for 2027, though the division is weak enough that a rebound isn't out of reach.",
      "at": "2026-10-11"
    },
    "mlb_twins": {
      "text": "77-85 and third in the AL Central, and catcher Ryan Jeffers, one of the best bats on the market, is a free agent. Likely a middle-of-the-pack team; the playoffs would be a surprise.",
      "at": "2026-10-11"
    },
    "mlb_white_sox": {
      "text": "The surprise of 2026: 84-78 and a wild-card win before Cleveland beat them in a five-game ALDS. Whether it holds is the question, but the AL Central is winnable in 2027.",
      "at": "2026-10-11"
    },
    "mlb_yankees": {
      "text": "93 wins, then swept by Tampa Bay in the ALDS. Aaron Judge keeps them a perennial playoff team, but the AL East (+2) went through the Rays this year and will be hard to win back.",
      "at": "2026-10-11"
    },
    "nba_76ers": {
      "text": "LeBron James and Jaylen Brown join Joel Embiid and Tyrese Maxey, and Embiid reportedly had a strong summer of knee rehab. Backup center Ariel Hukporti is out for the season with a torn Achilles. The highest-variance contender in the East.",
      "at": "2026-10-11"
    },
    "nba_blazers": {
      "text": "Micah Nori is the new coach, and the trade for Ja Morant pairs him with Damian Lillard and Scoot Henderson. Previews expect growing pains; a play-in team, with the Northwest out of reach.",
      "at": "2026-10-11"
    },
    "nba_bucks": {
      "text": "Traded Giannis Antetokounmpo to Miami and hired Taylor Jenkins to run a rebuild. A near-consensus bottom-three team, and a leading candidate for last in the Central (-2) and the East's worst record (-3).",
      "at": "2026-10-11"
    },
    "nba_bulls": {
      "text": "Tiago Splitter takes over a rebuild built around Caleb Wilson and Matas Buzelis, who left a preseason game with an ankle injury. Expect a lottery team; last place in the Central (-2) is the main risk.",
      "at": "2026-10-11"
    },
    "nba_cavaliers": {
      "text": "James Harden, Donovan Mitchell and Evan Mobley get a full season together after last year's run to the East finals. A top-four seed looks likely, and the Central (+2) is a real race with Detroit.",
      "at": "2026-10-11"
    },
    "nba_celtics": {
      "text": "Jayson Tatum is back, and they swapped Jaylen Brown for Paul George and added Mitchell Robinson after a 56-win season. Expect a top-four seed; the Atlantic (+2) is a three-way fight with New York and Philadelphia.",
      "at": "2026-10-11"
    },
    "nba_clippers": {
      "text": "Lost Kawhi Leonard to Toronto, and the league's salary-cap penalties cost them five first-round picks, a $30 million fine and a one-year ban for Steve Ballmer. Previews rank them near the bottom; last in the Pacific (-2) is a real risk.",
      "at": "2026-10-11"
    },
    "nba_grizzlies": {
      "text": "Traded Ja Morant and are starting over around rookie Cam Boozer and Zach Edey, whose health is the big question. A rebuilding year; last in the Southwest (-2) and the West's worst record (-3) are both on the table.",
      "at": "2026-10-11"
    },
    "nba_hawks": {
      "text": "Life after Trae Young: a fast team built around Jalen Johnson, with Lu Dort added on defense. Previews call them too good to bottom out but short of a conference-finals ceiling; a play-in or low playoff seed is likeliest.",
      "at": "2026-10-11"
    },
    "nba_heat": {
      "text": "Landed Giannis Antetokounmpo to pair with Bam Adebayo, which should make them a strong defensive team. Shooting is the question, but they're a real threat for the Southeast (+2) and a deep East run.",
      "at": "2026-10-11"
    },
    "nba_hornets": {
      "text": "Traded LaMelo Ball to Minnesota and are leaning on Brandon Miller, Kon Knueppel and a deep bench after a 44-win year. A play-in contender; missing the playoffs is slightly likelier.",
      "at": "2026-10-11"
    },
    "nba_jazz": {
      "text": "Rookie Darryn Peterson joins Lauri Markkanen and Jaren Jackson Jr., and some previews call them a sleeper. Still a long way from the Northwest's top; avoiding last place (-2) is the realistic bar.",
      "at": "2026-10-11"
    },
    "nba_kings": {
      "text": "Domantas Sabonis, Zach LaVine and rookie Darius Acuff Jr. can score, but the defense projects as one of the worst in years. Ranked last on nearly every preview list: a prime candidate for the West's worst record (-3).",
      "at": "2026-10-11"
    },
    "nba_knicks": {
      "text": "The defending champions bring back nearly the whole title roster, minus Mitchell Robinson, who left for Boston. A top-three team in almost every preview and the slight favorite in the Atlantic (+2).",
      "at": "2026-10-11"
    },
    "nba_lakers": {
      "text": "Luka Dončić's team now, with LeBron James gone and Walker Kessler added to protect the rim. Previews are mixed on the supporting cast, but they're favored to win a soft Pacific (+2).",
      "at": "2026-10-11"
    },
    "nba_magic": {
      "text": "Sean Sweeney replaces Jamahl Mosley as coach of an expensive roster led by Paolo Banchero and Franz Wagner that underachieved last season. Previews see a mid-pack East playoff team, not a contender.",
      "at": "2026-10-11"
    },
    "nba_mavericks": {
      "text": "Dusty May takes over from Jason Kidd, and Cooper Flagg's second season depends on Kyrie Irving returning healthy from his knee injury. Dereck Lively is out indefinitely. A play-in team at best; last in the Southwest (-2) is a real risk.",
      "at": "2026-10-11"
    },
    "nba_nets": {
      "text": "Julius Randle leads a young, rebuilding roster ranked near the bottom of every preview. Strong candidates for last in the Atlantic (-2) and the East's worst record (-3).",
      "at": "2026-10-11"
    },
    "nba_nuggets": {
      "text": "Nikola Jokić ran the league's best offense last season, but a first-round exit and a reshuffled supporting cast raise questions. A sure playoff team; a deep run depends on the new pieces and the defense.",
      "at": "2026-10-11"
    },
    "nba_pacers": {
      "text": "Tyrese Haliburton is back from his Achilles tear, with only a mild ankle tweak in preseason, and Ivica Zubac and Kelly Oubre Jr. were added. After a 19-63 year without him, a return to the playoffs (+1) is realistic.",
      "at": "2026-10-11"
    },
    "nba_pelicans": {
      "text": "Jamahl Mosley takes over, hoping Dejounte Murray's return from an Achilles tear steadies a roster built around Zion Williamson. Previews project a lottery team; last in the Southwest (-2) is in play.",
      "at": "2026-10-11"
    },
    "nba_pistons": {
      "text": "Last season's East No. 1 seed at 60-22, built around Cade Cunningham and Jalen Duren, lost in the second round. Favored to win the Central (+2) again and a realistic contender for the East's best record (+3).",
      "at": "2026-10-11"
    },
    "nba_raptors": {
      "text": "Kawhi Leonard is back in Toronto alongside Scottie Barnes, and previews rate them a high-upside playoff team. If Leonard stays healthy they're a safe playoff pick; the Atlantic is crowded, though.",
      "at": "2026-10-11"
    },
    "nba_rockets": {
      "text": "A deep roster built around Alperen Şengün, Amen Thompson and Kevin Durant, though previews call them a flawed contender. A solid bet for the playoffs, but the Spurs make the Southwest a long shot.",
      "at": "2026-10-11"
    },
    "nba_spurs": {
      "text": "Last year's runners-up rank first or second in nearly every preview, with Victor Wembanyama anchoring one of the league's best defenses and Tobias Harris added. Heavy Southwest favorites (+2) with a real shot at the West's best record (+3).",
      "at": "2026-10-11"
    },
    "nba_suns": {
      "text": "Devin Booker's team has health questions around Jalen Green and Mark Williams, and previews have them retooling. A fringe play-in team, though the Pacific is weak enough to keep them in the race.",
      "at": "2026-10-11"
    },
    "nba_thunder": {
      "text": "Title favorites again, with Shai Gilgeous-Alexander the league's toughest cover and Chet Holmgren's health the main watch item. They lost depth in Lu Dort, Isaiah Joe and Aaron Wiggins, but remain a safe bet for the Northwest (+2) and a strong one for the West's best record (+3).",
      "at": "2026-10-11"
    },
    "nba_timberwolves": {
      "text": "Traded Julius Randle and brought in LaMelo Ball to pair with Anthony Edwards, and some previews pick them to reach the Finals. The Northwest belongs to Oklahoma City, but playoffs and a deep run are realistic.",
      "at": "2026-10-11"
    },
    "nba_warriors": {
      "text": "Jimmy Butler is still working back from a torn ACL and may return around midseason, and the rest of Stephen Curry's supporting cast is aging. Rookie Yaxel Lendeborg impressed in summer league. A play-in team in most previews.",
      "at": "2026-10-11"
    },
    "nba_wizards": {
      "text": "Added Trae Young to a veteran-heavy build with Khris Middleton and Deandre Ayton after a 17-65 season, and previews question the fit. Still near the bottom of the East, so last in the Southeast (-2) is a strong possibility.",
      "at": "2026-10-11"
    },
    "nfl_49ers": {
      "text": "4-0 with the league's best point differential, and Brock Purdy, Christian McCaffrey and George Kittle are all producing. The NFC West (+2) and the NFC's best record (+3) both run through them right now.",
      "at": "2026-10-11"
    },
    "nfl_bears": {
      "text": "3-1 even with Caleb Williams out with a hamstring strain; Ben Johnson's offense still crushed the Jets with a backup starting. Williams could return soon. The defending NFC North champs are right in the division race (+2).",
      "at": "2026-10-11"
    },
    "nfl_bengals": {
      "text": "Joe Burrow's offense lost Ja'Marr Chase to a concussion in a home loss to the Jaguars, though he's expected back soon. The defense is the worry; a playoff spot is realistic, the AFC North (+2) harder with the Ravens and Browns ahead.",
      "at": "2026-10-11"
    },
    "nfl_bills": {
      "text": "Their first loss came at home to the Patriots, a game where they drifted away from James Cook and the run game. Josh Allen still makes them the AFC East favorite (+2), and a deep run is realistic.",
      "at": "2026-10-11"
    },
    "nfl_broncos": {
      "text": "Last year's 14-3 AFC West champs are 2-2 after a close loss to San Francisco, and they've lost both starting cornerbacks to injury. Bo Nix and the defense should get them into the playoff mix, but the Chiefs lead the division.",
      "at": "2026-10-11"
    },
    "nfl_browns": {
      "text": "Three straight wins, including a Thursday win over Pittsburgh, behind a defense that keeps getting after the quarterback. Tied for the AFC North lead at 3-1; avoiding last place (-2) looks likely and a wild-card push is possible.",
      "at": "2026-10-11"
    },
    "nfl_bucs": {
      "text": "Won in Dallas for their first victory after four one-score losses, with undrafted rookie Jalon Daniels starting for the injured Baker Mayfield. The NFC South is weak enough to climb back into once Mayfield returns; last place (-2) is still a risk.",
      "at": "2026-10-11"
    },
    "nfl_cardinals": {
      "text": "1-3 after letting a lead slip against the Giants, and still one of the thinnest rosters in the league after a 3-14 year. Last place in the NFC West (-2) is the likeliest outcome.",
      "at": "2026-10-11"
    },
    "nfl_chargers": {
      "text": "0-4 and the offense is broken: Justin Herbert is forcing plays, and Jim Harbaugh has been asked about coordinator Mike McDaniel's job. A playoff team last year, now at risk of last in the AFC West (-2) and the AFC's worst record (-3).",
      "at": "2026-10-11"
    },
    "nfl_chiefs": {
      "text": "4-0 after a 6-11 year, with Patrick Mahomes back in control and Kenneth Walker III giving them a real run game. Receiver depth is the weak spot. Strong favorites for the AFC West (+2), with the AFC's top seed (+3) in play.",
      "at": "2026-10-11"
    },
    "nfl_colts": {
      "text": "Daniel Jones is back from his Achilles and the defense has carried them to 2-2. A middle-of-the-pack AFC South team with a wild-card shot, though the Jaguars are the clear division favorite.",
      "at": "2026-10-11"
    },
    "nfl_commanders": {
      "text": "Jayden Daniels is hurt and Marcus Mariota left their last game with a knee injury, forcing rookie third-stringer Athan Kaliakmanis into action. At 1-3, last in the NFC East (-2) is a real risk until Daniels returns.",
      "at": "2026-10-11"
    },
    "nfl_cowboys": {
      "text": "Lost at home on Thursday to a winless Tampa Bay team, a week after a last-minute win over Houston. Dak Prescott's offense is explosive but the defense keeps leaking. A wild-card push is possible; the NFC East is wide open.",
      "at": "2026-10-11"
    },
    "nfl_dolphins": {
      "text": "0-4 under first-year coach Jeff Hafley, with a low-ceiling offense and De'Von Achane out for the season with a torn ACL. Strong candidates for last in the AFC East (-2) and the AFC's worst record (-3).",
      "at": "2026-10-11"
    },
    "nfl_eagles": {
      "text": "Saquon Barkley and DeVonta Smith are both out with hamstring injuries, and the offense sputtered in a loss to the Rams. Still the team to beat in a muddled NFC East (+2), but a deep January run looks less likely than last year.",
      "at": "2026-10-11"
    },
    "nfl_falcons": {
      "text": "Bijan Robinson and Brian Robinson Jr. combined for five rushing touchdowns in a rout of the Saints, and Michael Penix Jr. is under center. In an NFC South with no clear leader, they're a real division-title candidate (+2).",
      "at": "2026-10-11"
    },
    "nfl_giants": {
      "text": "3-1 thanks to a defense that's playing well, but Jaxson Dart is out for the season after knee surgery. After a 4-13 year, holding on in the NFC East depends on the stopgap quarterbacks; last place (-2) is still a risk.",
      "at": "2026-10-11"
    },
    "nfl_jaguars": {
      "text": "Last year's AFC South champs are 3-1 after a road win in Cincinnati, with Trevor Lawrence steady and Travis Hunter contributing. Penalties are the main flaw. Favorites to repeat in the division (+2), with Houston 0-4.",
      "at": "2026-10-11"
    },
    "nfl_jets": {
      "text": "1-3 after being run off the field by the Bears, outgained by more than 300 yards. Still rebuilding after a 3-14 season, so avoiding last in the AFC East (-2) and the AFC's worst record (-3) is the realistic goal.",
      "at": "2026-10-11"
    },
    "nfl_lions": {
      "text": "Lost to Carolina with Jahmyr Gibbs bottled up, and the defense keeps fading late. At 2-2 and behind the unbeaten Vikings and the Bears, the NFC North is a three-way fight; a wild-card spot is the realistic aim.",
      "at": "2026-10-11"
    },
    "nfl_packers": {
      "text": "Lost linebacker Edgerrin Cooper for the season to a torn Achilles, and even their win in Tampa was ugly. Jordan Love's offense has no consistent run game, and a crowded NFC North makes the playoffs shaky.",
      "at": "2026-10-11"
    },
    "nfl_panthers": {
      "text": "Upset Detroit behind 329 passing yards from Bryce Young and two Chuba Hubbard touchdowns, despite missing receiver Jalen Coker. The defending NFC South champs are 2-2 in a division with no clear leader.",
      "at": "2026-10-11"
    },
    "nfl_patriots": {
      "text": "Last year's AFC champs got back to 2-2 with a road win in Buffalo, and Drake Maye is making clutch plays again. Still the Bills' main AFC East rival; a playoff return is realistic.",
      "at": "2026-10-11"
    },
    "nfl_raiders": {
      "text": "3-1 with Kirk Cousins starting and Brock Bowers the focal point, and they pushed the unbeaten Chiefs to the wire. Ashton Jeanty's foot injury could cost him time. After a 3-14 year, a wild-card run would be a big bonus.",
      "at": "2026-10-11"
    },
    "nfl_rams": {
      "text": "Rallied past the Eagles in the fourth quarter to get back to 2-2, and Matthew Stafford still has one of the deepest rosters in the league. The NFC West (+2) is a real fight with the 49ers and Seahawks; deep-run points are realistic.",
      "at": "2026-10-11"
    },
    "nfl_ravens": {
      "text": "Lamar Jackson sprained his ankle and is expected to miss a couple of weeks, with Tyler Huntley starting. The roster is good enough to tread water; the AFC North (+2) is still theirs to lose once Jackson is back.",
      "at": "2026-10-11"
    },
    "nfl_saints": {
      "text": "Blown out by Atlanta, allowing more than 200 rushing yards, to fall to 1-3. Tyler Shough has been productive, but the defense has collapsed; last in the NFC South (-2) is now a bigger risk than a division title.",
      "at": "2026-10-11"
    },
    "nfl_seahawks": {
      "text": "The defending champions bounced back from the loss to Washington by routing the Chargers 27-6. The defense is elite again; the NFC West is a three-way fight with the 49ers and Rams, but a playoff spot looks safe.",
      "at": "2026-10-11"
    },
    "nfl_steelers": {
      "text": "Aaron Rodgers and D.K. Metcalf rallied late in a Thursday loss to Cleveland, but the offense has been uneven and the coaching staff tense. Last year's AFC North champs look like a wild-card hopeful at best.",
      "at": "2026-10-11"
    },
    "nfl_texans": {
      "text": "0-4 after giving up another late lead, and the defense that carried them last year has slipped. C.J. Stroud lacks help at receiver. Last place in the AFC South (-2) is now as likely as a playoff return.",
      "at": "2026-10-11"
    },
    "nfl_titans": {
      "text": "0-4 and Cam Ward's second season is off to a rough start in a low-ceiling offense. The favorite for last in the AFC South (-2) and a leading contender for the AFC's worst record (-3).",
      "at": "2026-10-11"
    },
    "nfl_vikings": {
      "text": "4-0 on an elite defense, but the offense has failed to score a touchdown in two of those wins, and Justin Jefferson is nursing an ankle sprain. They lead the NFC North for now; the playoffs look likely, a division title (+2) less certain.",
      "at": "2026-10-11"
    },
    "nhl_avalanche": {
      "text": "Last season's Presidents' Trophy winners lead most power rankings, scoring at a ridiculous early clip around Nathan MacKinnon and Cale Makar. Strong bets for the Central (+2) and the West's best record (+3).",
      "at": "2026-10-11"
    },
    "nhl_blackhawks": {
      "text": "1-5 without Connor Bedard, and they've needed big goaltending just to stay in games. Lottery-bound, with last in the Central (-2) and the West's worst record (-3) both likely.",
      "at": "2026-10-11"
    },
    "nhl_blue_jackets": {
      "text": "Matthew Knies is leading the attack after the Kirill Marchenko trade, and a friendly early schedule gives them a chance to build. A bubble team; missing the playoffs again is slightly likelier.",
      "at": "2026-10-11"
    },
    "nhl_blues": {
      "text": "Joel Hofer stole a shutout win over Dallas, but a quiet summer left a thin attack. In a strong Central, last place in the division (-2) remains a real risk.",
      "at": "2026-10-11"
    },
    "nhl_bruins": {
      "text": "4-2 with Jeremy Swayman strong and J.J. Peterka fitting in, but the underlying play has been mediocre. After a 100-point season, most see them as a bubble team.",
      "at": "2026-10-11"
    },
    "nhl_canadiens": {
      "text": "Reached the East final last spring and look tighter defensively under Martin St. Louis, with Chris Kreider added. A strong bet for the playoffs and a real contender for the Atlantic title (+2).",
      "at": "2026-10-11"
    },
    "nhl_canucks": {
      "text": "2-4 after a 25-49-8 season, though Elias Pettersson looks like his old self early. Still the favorite for last in the Pacific (-2) and a contender for the West's worst record (-3).",
      "at": "2026-10-11"
    },
    "nhl_capitals": {
      "text": "3-1 with solid structure and the depth added around Alex Ovechkin, including Alex Tuch and Boone Jenner. A likely playoff team, though the Metropolitan still runs through Carolina.",
      "at": "2026-10-11"
    },
    "nhl_devils": {
      "text": "Even at 2-2, a 6-0 loss to the Islanders and little scoring have renewed questions about Jack Hughes and the goaltending. Talented enough for the playoffs if both settle; a bubble team otherwise.",
      "at": "2026-10-11"
    },
    "nhl_ducks": {
      "text": "Leo Carlsson and Cutter Gauthier lead a quick, young attack, and Tristan Luneau is logging big minutes on defense. After a second-round run last spring, a playoff spot in a weak Pacific looks realistic.",
      "at": "2026-10-11"
    },
    "nhl_flames": {
      "text": "0-4, outscored 16-3, with Dustin Wolf struggling behind the league's weakest attack. A leading candidate for last in the Pacific (-2) and the West's worst record (-3).",
      "at": "2026-10-11"
    },
    "nhl_flyers": {
      "text": "Winless in six and Rick Tocchet has called the play disturbing, with the league's worst five-on-five numbers. After a 98-point season, last in the Metropolitan (-2) and the East's worst record (-3) are now real risks.",
      "at": "2026-10-11"
    },
    "nhl_golden_knights": {
      "text": "Last season's Western Conference champions are 4-1 under new coach Ryan Craig, with Jack Eichel piling up assists and Adin Hill sharp. In a Pacific most see as weak, division points (+2) are a strong bet.",
      "at": "2026-10-11"
    },
    "nhl_hurricanes": {
      "text": "The Stanley Cup champions are missing Seth Jarvis, a 32-goal scorer last year, and the offense has felt it, but they're 4-1-1. Favorites to repeat in the Metropolitan (+2) and contend for the East's best record (+3).",
      "at": "2026-10-11"
    },
    "nhl_islanders": {
      "text": "Ilya Sorokin posted a 37-save shutout of New Jersey, and Matthew Schaefer is a budding star, but Mat Barzal is still out with a knee injury. Likely a bubble team at best.",
      "at": "2026-10-11"
    },
    "nhl_jets": {
      "text": "Playing without Connor Hellebuyck, with Stuart Skinner in goal, and off to a decent start. After a seventh-place finish in the Central, a playoff spot will take a lot from the skaters in front of him.",
      "at": "2026-10-11"
    },
    "nhl_kings": {
      "text": "Winless in three with poor goaltending, and Artemi Panarin alone isn't enough. In a weak Pacific a playoff spot is still possible, but this looks like a bubble team at best.",
      "at": "2026-10-11"
    },
    "nhl_kraken": {
      "text": "3-2, helped by two lopsided wins over Calgary, though their underlying numbers are middling. Likely near the bottom of the Pacific, where last place (-2) is a real risk.",
      "at": "2026-10-11"
    },
    "nhl_lightning": {
      "text": "4-1 despite a power play that hasn't scored yet, and Jon Cooper's team looks like itself again. A likely playoff team with a shot at the Atlantic (+2); the question remains whether they can end four straight first-round exits.",
      "at": "2026-10-11"
    },
    "nhl_mammoth": {
      "text": "4-2 with a power play converting at a huge rate, as Nick Schmaltz, Clayton Keller and Dylan Guenther lead the way. One of the most dangerous young teams in the West; a wild-card spot is the floor, the Central possible.",
      "at": "2026-10-11"
    },
    "nhl_maple_leafs": {
      "text": "Rookie Gavin McKenna has had an up-and-down start, and Sergei Bobrovsky's play in goal has been mixed. After finishing last in the Atlantic last season, avoiding the basement (-2) is the first goal.",
      "at": "2026-10-11"
    },
    "nhl_oilers": {
      "text": "Unbeaten in regulation through five, with Evan Bouchard scoring heavily for Mike Babcock's team. Goaltending is the familiar worry, though Devon Levi is gaining ground. Connor McDavid and Leon Draisaitl make them a top Pacific contender (+2).",
      "at": "2026-10-11"
    },
    "nhl_panthers": {
      "text": "Aleksander Barkov is out at least six weeks and Brad Marchand has a knee injury, so the Brady Tkachuk era started slowly with three overtime games. Still built for a big rebound after missing the playoffs; the Atlantic title (+2) may take a while.",
      "at": "2026-10-11"
    },
    "nhl_penguins": {
      "text": "Off to a strong start with new depth pieces fitting in around Sidney Crosby. Goaltending is still the question after a 98-point year, but a playoff return looks realistic.",
      "at": "2026-10-11"
    },
    "nhl_predators": {
      "text": "An aging roster with Mavrik Bourque and Matthew Wood as the young hope, and little scoring so far. Bottom-five in most previews; a candidate for last in the Central (-2).",
      "at": "2026-10-11"
    },
    "nhl_rangers": {
      "text": "4-2 after trading Artemi Panarin, with Sean Durzi steadying the blue line and Eeli Tolvanen scoring. Better than expected so far, though most still see them as a bubble team in the Metropolitan.",
      "at": "2026-10-11"
    },
    "nhl_red_wings": {
      "text": "1-3-1 and Dylan Larkin, who asked for a trade, hasn't played. The situation hangs over a team ranked in the bottom third; last in the Atlantic (-2) is a real possibility.",
      "at": "2026-10-11"
    },
    "nhl_sabres": {
      "text": "Last season's surprise Atlantic champions are 2-3, with Jiri Kulich back scoring after a blood clot. Rasmus Dahlin's group should make the playoffs, but repeating as division champs will be hard.",
      "at": "2026-10-11"
    },
    "nhl_senators": {
      "text": "4-1 to start the post-Brady Tkachuk era, with Linus Ullmark looking solid in goal. A bubble team on paper; a good start gives them a real shot at the playoffs (+1).",
      "at": "2026-10-11"
    },
    "nhl_sharks": {
      "text": "3-2 with captain Macklin Celebrini leading a fun young team, though veterans Darnell Nurse and Jacob Trouba have struggled. Some previews have them third in the Pacific; a playoff push is realistic.",
      "at": "2026-10-11"
    },
    "nhl_stars": {
      "text": "A slow start in a deep Central, with depth thinner than in past years. Jason Robertson and the core still give them a safe playoff floor, but after three straight West final losses, the division (+2) is a fight with Colorado and Minnesota.",
      "at": "2026-10-11"
    },
    "nhl_wild": {
      "text": "Kirill Kaprizov is scoring, Quinn Hughes is logging heavy minutes and Jesper Wallstedt has been strong in goal. One of the best starts in the league; a real contender for the Central (+2).",
      "at": "2026-10-11"
    },
    "pga_aaron_rai": {
      "text": "Won the PGA Championship (+5) and was T11 at the U.S. Open. Little else, though: two top-10s all year and six missed cuts, including The Open (-2).",
      "at": "2026-10-11"
    },
    "pga_adam_scott": {
      "text": "Reached the TOUR Championship (+2) and was T9 at The Open, but missed the PGA and U.S. Open cuts (-2 each). Made the Presidents Cup team at 46.",
      "at": "2026-10-11"
    },
    "pga_akshay_bhatia": {
      "text": "Won the Arnold Palmer Invitational, but missed cuts at three majors (-2 each) and seven times overall. High ceiling, real downside in this scoring.",
      "at": "2026-10-11"
    },
    "pga_aldrich_potgieter": {
      "text": "The long-hitting South African made just 11 of 23 cuts (-1 each) and missed the Masters cut (-2). Unconfirmed reports have linked him to LIV.",
      "at": "2026-10-11"
    },
    "pga_alex_fitzpatrick": {
      "text": "Matt's younger brother reached the TOUR Championship (+2) and tied for fourth there. Made 12 of 14 cuts; T23 at the U.S. Open was his best major.",
      "at": "2026-10-11"
    },
    "pga_alex_noren": {
      "text": "Four top-10s and T18 at The Open, but no wins in 2026 and a missed cut at the U.S. Open (-2). Turned 44 in July.",
      "at": "2026-10-11"
    },
    "pga_alex_smalley": {
      "text": "Tied for second at the PGA Championship, his best result, and made the TOUR Championship (+2). Still looking for a first PGA Tour win; missed the U.S. Open cut (-2).",
      "at": "2026-10-11"
    },
    "pga_andrew_putnam": {
      "text": "Runner-up once and made the cut at the PGA and U.S. Open, but missed seven cuts in 24 starts.",
      "at": "2026-10-11"
    },
    "pga_austin_smotherman": {
      "text": "Won the Bank of Utah Championship this month (a fall event, so it doesn't count), but missed 10 cuts in 23 starts, including the PGA (-2).",
      "at": "2026-10-11"
    },
    "pga_beau_hossler": {
      "text": "Runner-up once and averaged 69.1, but missed eight cuts and played no majors. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_ben_griffin": {
      "text": "Made the cut in all four majors (T14 at the PGA) but went winless in 2026 and missed seven cuts in other events (-1 each).",
      "at": "2026-10-11"
    },
    "pga_brian_harman": {
      "text": "Made the cut at three majors but missed The Open (-2). Two top-10s and no win in 2026.",
      "at": "2026-10-11"
    },
    "pga_bud_cauley": {
      "text": "Won the RBC Canadian Open. Made the cut in all three majors he played; T18 at The Open was his best.",
      "at": "2026-10-11"
    },
    "pga_cameron_young": {
      "text": "Won THE PLAYERS and the new Cadillac Championship and made all 20 cuts. Third at the Masters and runner-up at The Open, so he's a strong bet for major top 10s (+2).",
      "at": "2026-10-11"
    },
    "pga_chris_gotterup": {
      "text": "Three wins in 2026: the Sony Open, the WM Phoenix Open and the John Deere Classic. Made the Presidents Cup team and finished T10 at the PGA, but has yet to contend for a major.",
      "at": "2026-10-11"
    },
    "pga_collin_morikawa": {
      "text": "Won at Pebble Beach and was T7 at the Masters. Made 16 of 18 cuts and the Presidents Cup team; a reliable TOUR Championship qualifier (+2).",
      "at": "2026-10-11"
    },
    "pga_corey_conners": {
      "text": "Made all four major cuts (T14 at The Open) and played for the Internationals at the Presidents Cup, but had only one top-10 all season.",
      "at": "2026-10-11"
    },
    "pga_daniel_berger": {
      "text": "Runner-up once, but missed the cut at the Masters, U.S. Open and The Open (-2 each) and six times in 18 starts.",
      "at": "2026-10-11"
    },
    "pga_davis_thompson": {
      "text": "Four top-10s, but missed eight cuts and the only major he played, the U.S. Open (-2).",
      "at": "2026-10-11"
    },
    "pga_eric_cole": {
      "text": "Four top-10s and a runner-up, but no win, and he played only one major (T53 at The Open).",
      "at": "2026-10-11"
    },
    "pga_gary_woodland": {
      "text": "Won the Houston Open and was T7 at the U.S. Open. Missed six cuts, including the PGA and The Open (-2 each).",
      "at": "2026-10-11"
    },
    "pga_harris_english": {
      "text": "T18 at the PGA, but only one top-10 all season and missed cuts at the U.S. Open and The Open (-2 each).",
      "at": "2026-10-11"
    },
    "pga_harry_hall": {
      "text": "Missed the cut in all four majors (-8 in this scoring) and 10 times overall. Four top-10s in other events.",
      "at": "2026-10-11"
    },
    "pga_hideki_matsuyama": {
      "text": "Made all 24 cuts, so no penalties, and was top 30 in all four majors. No wins in 2026; a steady TOUR Championship qualifier (+2).",
      "at": "2026-10-11"
    },
    "pga_j_j_spaun": {
      "text": "Won the Valero Texas Open but missed the cut in three majors (-2 each) and eight times overall. Withdrew from the TOUR Championship.",
      "at": "2026-10-11"
    },
    "pga_j_t_poston": {
      "text": "Won the Memorial, a signature event, and tied for fourth at the U.S. Open. Missed the cut at the PGA and The Open (-2 each) and six times overall.",
      "at": "2026-10-11"
    },
    "pga_jackson_koivun": {
      "text": "Won the 3M Open in only his ninth start and made eight cuts in nine events, then earned a Presidents Cup spot.",
      "at": "2026-10-11"
    },
    "pga_jackson_suber": {
      "text": "T28 at The Open and three top-10s, but missed the U.S. Open cut (-2) and seven cuts overall.",
      "at": "2026-10-11"
    },
    "pga_jacob_bridgeman": {
      "text": "Won the Genesis Invitational, a signature event, then the Biltmore Championship in September (fall events don't count). Made 24 of 25 cuts but missed the cut at the PGA (-2).",
      "at": "2026-10-11"
    },
    "pga_jake_knapp": {
      "text": "Finished 11th at the Masters and averaged under 69, but played only 17 events and missed five cuts, including the U.S. Open and The Open (-2 each).",
      "at": "2026-10-11"
    },
    "pga_johnny_keefer": {
      "text": "Five top-10s and made three major cuts, but missed nine cuts in 27 starts, including the Masters (-2).",
      "at": "2026-10-11"
    },
    "pga_jordan_smith": {
      "text": "The Englishman averaged 69.3 with two top-10s and was T18 at The Open, but missed the PGA cut (-2).",
      "at": "2026-10-11"
    },
    "pga_jordan_spieth": {
      "text": "Made 20 of 23 cuts, with T12 at the Masters and T18 at the PGA, but had no top-10 finishes all season.",
      "at": "2026-10-11"
    },
    "pga_justin_rose": {
      "text": "Won the Farmers Insurance Open at 45, tied for third at the Masters and was top 11 at the PGA and U.S. Open. Missed the cut at The Open (-2).",
      "at": "2026-10-11"
    },
    "pga_justin_thomas": {
      "text": "Came back from back surgery that cost him the start of 2026, tied for fourth at the PGA and made the Presidents Cup team. Made 17 of 18 cuts; no win.",
      "at": "2026-10-11"
    },
    "pga_keegan_bradley": {
      "text": "No top-10s in 2026 and missed the PGA cut (-2). Made the other three major cuts but finished no better than T21.",
      "at": "2026-10-11"
    },
    "pga_keith_mitchell": {
      "text": "Tied for fourth at the U.S. Open and averaged 69.3, but missed The Open cut (-2). No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_kristoffer_reitan": {
      "text": "The Norwegian won the Truist Championship, a signature event, and made the TOUR Championship (+2). Missed six cuts, including the U.S. Open (-2).",
      "at": "2026-10-11"
    },
    "pga_kurt_kitayama": {
      "text": "T10 at the PGA and missed only two cuts in 22 starts. No win in 2026, and finished just outside the TOUR Championship field.",
      "at": "2026-10-11"
    },
    "pga_ludvig_aberg": {
      "text": "Nine top-10s and top 25 in all four majors (T4 at the PGA, T9 at The Open), but no win in 2026. T4 at the TOUR Championship.",
      "at": "2026-10-11"
    },
    "pga_mac_meissner": {
      "text": "Four top-10s but missed nine cuts in 24 starts and played no majors.",
      "at": "2026-10-11"
    },
    "pga_matt_fitzpatrick": {
      "text": "Won the Valspar and the RBC Heritage and finished second in FedEx points. Majors were thinner: T18 at the Masters and T14 at the PGA, then a missed cut at The Open (-2).",
      "at": "2026-10-11"
    },
    "pga_matt_mccarty": {
      "text": "Missed the cut at three majors (-2 each) and nine times in 28 starts. T24 at the Masters was the highlight.",
      "at": "2026-10-11"
    },
    "pga_matt_wallace": {
      "text": "Runner-up once and made the cut at the PGA and The Open, but missed seven cuts in 20 starts.",
      "at": "2026-10-11"
    },
    "pga_matti_schmid": {
      "text": "Tied for fourth at the PGA, but missed nine cuts in 22 starts, including the U.S. Open (-2).",
      "at": "2026-10-11"
    },
    "pga_maverick_mcnealy": {
      "text": "T18 at both the Masters and the PGA and made 20 of 23 cuts. Still looking for a second PGA Tour win.",
      "at": "2026-10-11"
    },
    "pga_max_homa": {
      "text": "T9 at the Masters and runner-up once, but missed the PGA cut (-2) and five cuts overall. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_michael_brennan": {
      "text": "Won the Wyndham Championship and then the Baycurrent Classic this week (fall events don't count). Made the cut in all four majors.",
      "at": "2026-10-11"
    },
    "pga_michael_kim": {
      "text": "A runner-up finish and 20 cuts made in 27 starts, but missed the cut at the Masters and The Open (-2 each).",
      "at": "2026-10-11"
    },
    "pga_michael_thorbjornsen": {
      "text": "Won the Rocket Classic. Majors are a work in progress: a missed PGA cut (-2) and T40 at The Open.",
      "at": "2026-10-11"
    },
    "pga_min_woo_lee": {
      "text": "Two runner-up finishes and T4 at the TOUR Championship, but missed the cut at the Masters and U.S. Open (-2 each). T18 at the PGA was his best major.",
      "at": "2026-10-11"
    },
    "pga_nick_taylor": {
      "text": "Made 24 of 26 cuts and the Presidents Cup team, but had just one top-10 and missed the U.S. Open cut (-2).",
      "at": "2026-10-11"
    },
    "pga_nico_echavarria": {
      "text": "Won the Cognizant Classic and played for the Internationals at the Presidents Cup, but missed the cut at the Masters and PGA (-2 each) and nine times overall.",
      "at": "2026-10-11"
    },
    "pga_nicolai_h_jgaard": {
      "text": "Two runner-up finishes, but missed the cut at the Masters, U.S. Open and The Open (-2 each). The Dane still hasn't won on the PGA Tour.",
      "at": "2026-10-11"
    },
    "pga_patrick_cantlay": {
      "text": "Top 15 at the Masters and made the Presidents Cup team, but no wins in 2026 and a missed cut at the U.S. Open (-2).",
      "at": "2026-10-11"
    },
    "pga_patrick_rodgers": {
      "text": "Missed the PGA cut (-2) and six cuts overall, with one top-10 all season. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_pierceson_coody": {
      "text": "A runner-up finish and T23 at the U.S. Open, but missed 10 cuts in 28 starts (-1 each), plus the PGA (-2).",
      "at": "2026-10-11"
    },
    "pga_rickie_fowler": {
      "text": "No wins, but five top-10s and T18 at The Open. Missed the U.S. Open cut (-2) and planned offseason sinus surgery.",
      "at": "2026-10-11"
    },
    "pga_ricky_castillo": {
      "text": "Won the Puerto Rico Open, an opposite-field event, and made 20 of 21 cuts. Played only one major and missed that cut (-2).",
      "at": "2026-10-11"
    },
    "pga_robert_macintyre": {
      "text": "Six top-10s and a runner-up, but missed the cut at the Masters and PGA (-2 each) and finished 28th of 30 at the TOUR Championship.",
      "at": "2026-10-11"
    },
    "pga_rory_mcilroy": {
      "text": "Won the Masters again (+5) and was T7 at the PGA. Plays a light schedule (14 starts) and made 13 cuts, so few missed-cut penalties.",
      "at": "2026-10-11"
    },
    "pga_russell_henley": {
      "text": "Won the Charles Schwab Challenge and tied for third at the Masters. T9 at The Open, but missed the cut at the PGA (-2).",
      "at": "2026-10-11"
    },
    "pga_ryan_fox": {
      "text": "Won The Open (+5), easily the best year of his career. The New Zealander was otherwise quiet in majors, missing the cut at the Masters (-2).",
      "at": "2026-10-11"
    },
    "pga_ryan_gerard": {
      "text": "Third at the TOUR Championship and three runner-up finishes, but no win yet. T9 at The Open; missed the U.S. Open cut (-2).",
      "at": "2026-10-11"
    },
    "pga_ryo_hisatsune": {
      "text": "Made 24 of 27 cuts and the Presidents Cup team. No wins, and his best major was T35 at the PGA.",
      "at": "2026-10-11"
    },
    "pga_sahith_theegala": {
      "text": "Made 24 of 26 cuts and was T11 at the U.S. Open. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_sam_burns": {
      "text": "No wins, but runner-up at the U.S. Open, third at The Open and T7 at the Masters. Few players picked up more major top-10 points (+2 each) in 2026.",
      "at": "2026-10-11"
    },
    "pga_sam_stevens": {
      "text": "T7 at the U.S. Open and made three major cuts, but missed The Open cut (-2) and seven cuts overall. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_scottie_scheffler": {
      "text": "Won the FedEx Cup (+3) by taking St. Jude and the TOUR Championship, plus The American Express. Top 15 in all four majors (2nd at Augusta, T4 at both Opens) and one missed cut all year. The safest bet for the combined FedEx points bonus (+5).",
      "at": "2026-10-11"
    },
    "pga_sepp_straka": {
      "text": "Missed the cut at the PGA and U.S. Open (-2 each) and six times overall, with a scoring average near 71. Three top-10s and no wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_shane_lowry": {
      "text": "Runner-up once and T28 at The Open, but missed the U.S. Open cut (-2) and five cuts in 18 starts. No wins in 2026.",
      "at": "2026-10-11"
    },
    "pga_si_woo_kim": {
      "text": "No wins, but 11 top-10 finishes and one missed cut in 24 starts; that missed cut came at the U.S. Open (-2). A steady TOUR Championship qualifier (+2) still waiting on a big win.",
      "at": "2026-10-11"
    },
    "pga_steven_fisk": {
      "text": "Won the ISCO Championship, an opposite-field event, but missed nine cuts in 23 starts, plus the PGA (-2).",
      "at": "2026-10-11"
    },
    "pga_sudarshan_yellamaraju": {
      "text": "The Canadian had three top-10s but missed the cut at both majors he played (-2 each) and eight times overall.",
      "at": "2026-10-11"
    },
    "pga_sungjae_im": {
      "text": "Six top-10s and T14 at The Open; made the Presidents Cup team. No wins, and missed the PGA cut (-2).",
      "at": "2026-10-11"
    },
    "pga_tom_kim": {
      "text": "Third at the U.S. Open and won the Genesis Scottish Open. Made the TOUR Championship and the Presidents Cup team; missed The Open cut (-2).",
      "at": "2026-10-11"
    },
    "pga_tommy_fleetwood": {
      "text": "Missed just one cut in 19 starts, though it came at the PGA (-2). T4 at The Open and T11 at the U.S. Open; still chasing his first major.",
      "at": "2026-10-11"
    },
    "pga_viktor_hovland": {
      "text": "Won the Travelers and was runner-up at the TOUR Championship, but missed the cut in three majors (-2 each). Big upside with real penalty risk.",
      "at": "2026-10-11"
    },
    "pga_wyndham_clark": {
      "text": "Won the U.S. Open (+5), the Byron Nelson and the BMW Championship. Streaky, though: six missed cuts, including the PGA and The Open (-2 each).",
      "at": "2026-10-11"
    },
    "pga_xander_schauffele": {
      "text": "Top 20 in every major (T7 at the PGA, T9 at the Masters) and made the Presidents Cup team, but went winless in 2026. Eight top-10s keep him a safe source of major points.",
      "at": "2026-10-11"
    },
    "wnba_aces": {
      "text": "The 2025 champions were swept by Golden State in the semifinals, losing the clincher in overtime. A'ja Wilson keeps them a safe playoff bet and a title threat in 2027.",
      "at": "2026-10-11"
    },
    "wnba_dream": {
      "text": "The East's top seed at 30-14 swept the Liberty to reach their first Finals since 2013, against Golden State starting Oct. 17. A proven contender for a top-two record (+2) again in 2027.",
      "at": "2026-10-11"
    },
    "wnba_fever": {
      "text": "Caitlin Clark and Kelsey Mitchell powered the highest-scoring offense in league history, but they went out in the first round. Health (Clark's back, Aliyah Boston's leg) is the question; a strong playoff bet for 2027.",
      "at": "2026-10-11"
    },
    "wnba_fire": {
      "text": "Portland's expansion team went 17-27 in year one, respectable for a new club. Still more likely to miss the playoffs (-3) than make them in 2027.",
      "at": "2026-10-11"
    },
    "wnba_liberty": {
      "text": "A 26-18 team that never settled on a lineup through injuries, then reached the semifinals before the Dream swept them. More talented than the record; a healthier 2027 could put them back in the title mix.",
      "at": "2026-10-11"
    },
    "wnba_lynx": {
      "text": "The league's best record at 33-11, then a stunning first-round exit. A consistent regular-season machine that should be in the top-two record race (+2) again in 2027.",
      "at": "2026-10-11"
    },
    "wnba_mercury": {
      "text": "Slumped to 16-28 and missed the playoffs. They need a big offseason; missing the playoffs again (-3) is the likelier outcome.",
      "at": "2026-10-11"
    },
    "wnba_mystics": {
      "text": "A surprising 28-16 and second in the East before a first-round exit. A young team on the rise, but they'll need to show it wasn't a one-off.",
      "at": "2026-10-11"
    },
    "wnba_sky": {
      "text": "16-28 and out of the playoffs again despite signing Azura Stevens. Still rebuilding; missing the playoffs (-3) is likely in 2027.",
      "at": "2026-10-11"
    },
    "wnba_sparks": {
      "text": "16-28 and sixth in the West. A lottery-level team that will likely miss the playoffs again (-3).",
      "at": "2026-10-11"
    },
    "wnba_storm": {
      "text": "8-36, the worst record in the league. The favorite for a bottom-three finish (-2) and missing the playoffs (-3) again.",
      "at": "2026-10-11"
    },
    "wnba_sun": {
      "text": "11-33, among the league's worst records, even with Brittney Griner added. Still rebuilding; a strong candidate for a bottom-three record (-2) and missing the playoffs (-3).",
      "at": "2026-10-11"
    },
    "wnba_tempo": {
      "text": "Toronto's expansion team went 11-33 in year one. Improvement is likely, but a bottom-three record (-2) and missing the playoffs (-3) remain the likeliest outcomes.",
      "at": "2026-10-11"
    },
    "wnba_valkyries": {
      "text": "Only in their second season, they went 32-12 and swept the defending champion Aces to become the fastest expansion team to reach the Finals. Gabby Williams, added this year, anchors the defense; a strong bet for playoff points again.",
      "at": "2026-10-11"
    },
    "wnba_wings": {
      "text": "Made the playoffs at 27-17 despite a brutal run of injuries, including 2026 No. 1 pick Azzi Fudd, then lost in the first round. With a healthier roster they could climb in 2027.",
      "at": "2026-10-11"
    }
  }
};
