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
      "text": "4-0 and No. 7 in the AP poll after last year's CFP quarterfinal. A likely CFP team in a crowded SEC race.",
      "at": "2026-09-29"
    },
    "cfb_arizona": {
      "text": "3-1 and receiving AP votes after a nine-win season. A likely bowl team in the Big 12.",
      "at": "2026-09-29"
    },
    "cfb_arizona_state": {
      "text": "2-1 and unranked. A likely bowl team in the Big 12's middle.",
      "at": "2026-09-29"
    },
    "cfb_auburn": {
      "text": "3-1 after a 5-7 year with only one SEC win. A bowl is possible, but last place in the SEC (-3) is also in play.",
      "at": "2026-09-29"
    },
    "cfb_boise_state": {
      "text": "3-1 and No. 22 in the AP poll, and usually the class of its conference. A likely bowl team with an outside shot at the CFP's Group of Five spot.",
      "at": "2026-09-29"
    },
    "cfb_byu": {
      "text": "3-0 and No. 10 in the AP poll after a 12-2 season. A Big 12 contender (+320) and a realistic CFP candidate.",
      "at": "2026-09-29"
    },
    "cfb_clemson": {
      "text": "3-1 but unranked after a 7-6 year, with long ACC odds (+4400). A bowl team, not a contender.",
      "at": "2026-09-29"
    },
    "cfb_florida": {
      "text": "The biggest turnaround in the country: 4-8 last year, 4-0 and No. 8 in the AP poll now, and eighth in title odds. A bowl is all but certain; the CFP is realistic.",
      "at": "2026-09-29"
    },
    "cfb_florida_state": {
      "text": "2-2 after a 5-7 year and near the bottom of the ACC odds. Making a bowl is a toss-up; missing one costs -2.",
      "at": "2026-09-29"
    },
    "cfb_georgia": {
      "text": "4-0, No. 2 in the AP poll and No. 1 in ESPN's FPI. SEC favorites (+140) and second in title odds; a strong bet for the CFP and a deep run.",
      "at": "2026-09-29"
    },
    "cfb_houston": {
      "text": "3-1 and No. 20 in the AP poll after a 10-win season. A likely bowl team and a Big 12 dark horse.",
      "at": "2026-09-29"
    },
    "cfb_illinois": {
      "text": "2-2, including a loss to Ohio State, after a nine-win season. A bowl is realistic, but books see no real Big Ten title chance (+25000).",
      "at": "2026-09-29"
    },
    "cfb_indiana": {
      "text": "The undefeated defending national champions are 4-0 again and No. 6 in the AP poll. The Big Ten (+270) runs through Ohio State, but another CFP trip is realistic.",
      "at": "2026-09-29"
    },
    "cfb_iowa": {
      "text": "4-0 and No. 14 in the AP poll. A dependable bowl team; the Big Ten title is a long shot (+2400) with Ohio State, Indiana and Oregon above them.",
      "at": "2026-09-29"
    },
    "cfb_iowa_state": {
      "text": "2-2 after missing a bowl last year. A bowl bid is a coin flip in the Big 12.",
      "at": "2026-09-29"
    },
    "cfb_james_madison": {
      "text": "4-0, receiving AP votes, and Sun Belt favorites (+105) after a CFP trip last year. A strong bet for conference title points and a real shot at the CFP again.",
      "at": "2026-09-29"
    },
    "cfb_kansas_state": {
      "text": "3-1 after a 6-6 year. Likely a bowl team in the Big 12's middle.",
      "at": "2026-09-29"
    },
    "cfb_kentucky": {
      "text": "3-1 and ranked No. 24 after missing a bowl last year. A bowl looks likely now, which also avoids the -2 for missing one.",
      "at": "2026-09-29"
    },
    "cfb_liberty": {
      "text": "3-1 after a 4-8 year, and among the Conference USA favorites (+280). A bowl looks likely this time, which avoids the -2.",
      "at": "2026-09-29"
    },
    "cfb_louisville": {
      "text": "2-2 but receiving AP votes. Likely a bowl team in the ACC's middle tier.",
      "at": "2026-09-29"
    },
    "cfb_lsu": {
      "text": "3-1 and No. 11 in the AP poll after a 7-6 year, with books giving them the seventh-best title odds. A bowl looks safe; the CFP depends on the SEC gauntlet.",
      "at": "2026-09-29"
    },
    "cfb_memphis": {
      "text": "3-1, and one of the American's contenders (+425). A likely bowl team.",
      "at": "2026-09-29"
    },
    "cfb_miami": {
      "text": "Last year's national runners-up are 4-0, No. 4 in the AP poll and heavy ACC favorites (-350). Conference title and CFP points look very likely.",
      "at": "2026-09-29"
    },
    "cfb_michigan": {
      "text": "3-1 and just outside the AP Top 25. A bowl team again, with a slim Big Ten title shot (+7000).",
      "at": "2026-09-29"
    },
    "cfb_missouri": {
      "text": "3-1 and No. 25 in the AP poll. A likely bowl team, though the SEC title is out of reach.",
      "at": "2026-09-29"
    },
    "cfb_navy": {
      "text": "1-2 after an 11-win season. A bowl is still likely, but the American title (+4500) looks out of reach.",
      "at": "2026-09-29"
    },
    "cfb_ndsu": {
      "text": "An FCS powerhouse receiving AP votes, but it plays outside the FBS bowl system. It can't earn the usual bowl or CFP points, so its value depends on how your league scores FCS teams.",
      "at": "2026-09-29"
    },
    "cfb_nebraska": {
      "text": "4-0 and receiving AP votes. A bowl looks likely; the Big Ten title isn't.",
      "at": "2026-09-29"
    },
    "cfb_new_mexico": {
      "text": "3-1 and among the Mountain West favorites (+200). A good bet for a bowl and a real shot at the conference title (+2).",
      "at": "2026-09-29"
    },
    "cfb_notre_dame": {
      "text": "4-0, No. 3 in the AP poll and fourth in title odds. As an independent there's no conference title to chase, but a CFP spot (+2) looks likely after missing out last year.",
      "at": "2026-09-29"
    },
    "cfb_ohio_state": {
      "text": "Still books' national title favorite (+475) and even money to win the Big Ten, though a loss already dropped them to No. 5 in the AP poll. A near-lock for the CFP (+2), with semifinal and title-game upside.",
      "at": "2026-09-29"
    },
    "cfb_oklahoma": {
      "text": "Made the CFP last year but are 2-2 and unranked. A bowl is still likely; a return to the playoff would take a strong finish.",
      "at": "2026-09-29"
    },
    "cfb_ole_miss": {
      "text": "Last year's CFP semifinalists are 3-1 and No. 9 in the AP poll. Should be in the CFP mix again, though the SEC title (+2000) is a long shot.",
      "at": "2026-09-29"
    },
    "cfb_oregon": {
      "text": "Last year's CFP semifinalists slipped to No. 15 in the AP poll after a loss. Still a top-ten title bet for books; a CFP spot is likely if they stay in the Big Ten race.",
      "at": "2026-09-29"
    },
    "cfb_penn_state": {
      "text": "3-1 and just outside the AP Top 25 after a 7-6 year. A bowl is likely; books see little Big Ten title chance (+5500).",
      "at": "2026-09-29"
    },
    "cfb_smu": {
      "text": "3-1 and No. 21 in the AP poll. A solid bet for a bowl; an ACC title run would have to go through Miami.",
      "at": "2026-09-29"
    },
    "cfb_south_carolina": {
      "text": "2-2 after a 4-8 year and one SEC win. Risk of missing a bowl (-2) and finishing last in the SEC (-3).",
      "at": "2026-09-29"
    },
    "cfb_tcu": {
      "text": "2-2 after a nine-win year. A bowl is realistic; the Big 12 title isn't.",
      "at": "2026-09-29"
    },
    "cfb_tennessee": {
      "text": "3-1 and No. 17 in the AP poll. A likely bowl team, with the CFP a stretch in a deep SEC.",
      "at": "2026-09-29"
    },
    "cfb_texas": {
      "text": "The new AP No. 1 at 4-0 and third in national title odds. A strong CFP candidate; the SEC title (+240) is a two-horse race with Georgia.",
      "at": "2026-09-29"
    },
    "cfb_texas_a_and_m": {
      "text": "A CFP team last year, but 2-2 and unranked now with long SEC odds (+20000). Still likely to make a bowl; the CFP looks unlikely.",
      "at": "2026-09-29"
    },
    "cfb_texas_tech": {
      "text": "4-0, No. 12 in the AP poll, and Big 12 favorites (+200) after a CFP trip last year. A strong bet for conference title and CFP points.",
      "at": "2026-09-29"
    },
    "cfb_toledo": {
      "text": "3-1 and a leading MAC contender (+260). A bowl is likely, with conference-title upside.",
      "at": "2026-09-29"
    },
    "cfb_usc": {
      "text": "4-1 and No. 18 in the AP poll after a 9-4 year. Bowl points look safe; the Big Ten title is unlikely.",
      "at": "2026-09-29"
    },
    "cfb_utah": {
      "text": "4-0 and No. 13 in the AP poll, and a Big 12 contender (+290). Another bowl is a safe bet; the conference title would add CFP points.",
      "at": "2026-09-29"
    },
    "cfb_virginia": {
      "text": "3-1 after an 11-win season. A likely bowl team and an ACC dark horse (+1900).",
      "at": "2026-09-29"
    },
    "cfb_virginia_tech": {
      "text": "4-0 and receiving AP votes after a 3-9 season. A bowl looks likely now, and they're an ACC dark horse.",
      "at": "2026-09-29"
    },
    "cfb_washington": {
      "text": "3-1 after a nine-win year. A likely bowl team in the Big Ten's middle.",
      "at": "2026-09-29"
    },
    "cfb_western_michigan": {
      "text": "2-2 after a 10-win season, and books' MAC favorites (+194). A good bet for a bowl and a real conference-title shot.",
      "at": "2026-09-29"
    },
    "cfb_wisconsin": {
      "text": "3-1 and receiving AP votes after a 4-8 year. A bowl is realistic this time, which avoids the -2.",
      "at": "2026-09-29"
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
      "text": "Returns Aden Holloway among four of its top ten scorers; preseason No. 21. A likely tournament team.",
      "at": "2026-09-29"
    },
    "mcbb_arizona": {
      "text": "A 36-3 Final Four team that returns Motiejus Krivas and adds five-star Caleb Holt. Preseason top six; a strong Big 12 contender.",
      "at": "2026-09-29"
    },
    "mcbb_arkansas": {
      "text": "Returns Billy Richmond III and adds five-star JJ Andrews; tenth preseason and eighth in title odds. A likely tournament team with Elite Eight (+2) upside.",
      "at": "2026-09-29"
    },
    "mcbb_auburn": {
      "text": "Won the NIT after a 7-11 SEC season, and lost Keyshawn Hall to St. John's. A bubble team; missing the tournament (-2) is a real risk.",
      "at": "2026-09-29"
    },
    "mcbb_baylor": {
      "text": "17-17 and 6-12 in the Big 12. Bubble at best; last place in the conference (-3) is a risk.",
      "at": "2026-09-29"
    },
    "mcbb_byu": {
      "text": "Adds five-star Bruce Branch III to Robert Wright III; preseason No. 24. Should make the tournament after a 9-9 Big 12 year.",
      "at": "2026-09-29"
    },
    "mcbb_cincinnati": {
      "text": "18-15 and missed the tournament. A bubble team at best in the Big 12.",
      "at": "2026-09-29"
    },
    "mcbb_creighton": {
      "text": "16-18 and a sub-.500 Big East team. Likely to miss the tournament (-2) unless the rebuild clicks fast.",
      "at": "2026-09-29"
    },
    "mcbb_duke": {
      "text": "Went 35-3 and returns four of its top six scorers, led by Patrick Ngongba II and Caleb Foster. Co-favorite for the title (+600); ACC regular-season points (+3) look likely again.",
      "at": "2026-09-29"
    },
    "mcbb_florida": {
      "text": "No. 1 in CBS's preseason Top 25 and books' co-favorite (+600), bringing back six of its top seven scorers including Thomas Haugh and Alex Condon. A strong bet for the SEC regular-season title (+3) and a deep March run.",
      "at": "2026-09-29"
    },
    "mcbb_georgia": {
      "text": "A 22-win first-round team. A bubble team in the SEC; missing the tournament (-2) is possible.",
      "at": "2026-09-29"
    },
    "mcbb_gonzaga": {
      "text": "31-4 last year; returns Braden Huff and adds Houston transfer Isiah Harwell. Preseason No. 12 and a favorite in the rebuilt Pac-12, so conference title points are well within reach.",
      "at": "2026-09-29"
    },
    "mcbb_houston": {
      "text": "Lost Isiah Harwell to Gonzaga but adds LSU transfer Dedan Thomas Jr. to a veteran core. Preseason No. 14; a safe tournament bet.",
      "at": "2026-09-29"
    },
    "mcbb_illinois": {
      "text": "Final Four team that returns five of its top eight scorers, including Andrej Stojakovic. Third in CBS's preseason Top 25 and fourth in title odds; a Big Ten title contender.",
      "at": "2026-09-29"
    },
    "mcbb_indiana": {
      "text": "Missed the postseason last year, but CBS has them just outside its preseason Top 25 and books' title odds are 25th of 100. A tournament return is realistic.",
      "at": "2026-09-29"
    },
    "mcbb_iowa_state": {
      "text": "Returns four of its top six scorers, including Tamin Lipsey, and ranks 11th preseason. A dependable tournament team in the Big 12.",
      "at": "2026-09-29"
    },
    "mcbb_kansas": {
      "text": "Adds five-stars Tyran Stokes and Taylen Kinney but lost Flory Bidunga to Louisville. Preseason No. 18; a tournament team with upside.",
      "at": "2026-09-29"
    },
    "mcbb_kentucky": {
      "text": "Adds Iowa State transfer Milan Momcilovic to Malachi Moreno; preseason No. 19. A likely tournament team, though the SEC title looks like a stretch.",
      "at": "2026-09-29"
    },
    "mcbb_louisville": {
      "text": "Adds Kansas transfer Flory Bidunga to Adrian Wooley and ranks eighth preseason, seventh in title odds. A strong bet for the tournament and an ACC contender.",
      "at": "2026-09-29"
    },
    "mcbb_marquette": {
      "text": "12-20 and 7-13 in the Big East. Likely to miss the tournament (-2); last in the conference (-3) is in play.",
      "at": "2026-09-29"
    },
    "mcbb_memphis": {
      "text": "13-19 and missed the postseason. A rebuild year; missing the tournament (-2) is likely.",
      "at": "2026-09-29"
    },
    "mcbb_miami": {
      "text": "Returns four of its top seven scorers including Malik Reneau and is ranked 17th preseason. A likely tournament team in the ACC.",
      "at": "2026-09-29"
    },
    "mcbb_mich_state": {
      "text": "Returns five of its top eight scorers, led by Jeremy Fears Jr., and sits seventh in CBS's rankings. A likely tournament team and Big Ten contender.",
      "at": "2026-09-29"
    },
    "mcbb_michigan": {
      "text": "The defending national champions (37-3) return Elliot Cadeau, Trey McKenney and Roddy Gayle. Preseason No. 16 by CBS, higher elsewhere; a Big Ten contender again.",
      "at": "2026-09-29"
    },
    "mcbb_missouri": {
      "text": "Adds five-star Jason Crowe Jr. to Mark Mitchell and Trent Pierce; preseason No. 23. A likely tournament team in the SEC.",
      "at": "2026-09-29"
    },
    "mcbb_ndsu": {
      "text": "27-8 and 14-2 in the Summit League, then a first-round loss. Conference titles (+3, +2) are its path to points; a tournament bid depends on winning the Summit.",
      "at": "2026-09-29"
    },
    "mcbb_nebraska": {
      "text": "A 28-7 Sweet 16 team. Likely back in the tournament, though the Big Ten title is a long shot.",
      "at": "2026-09-29"
    },
    "mcbb_north_carolina": {
      "text": "Just outside CBS's preseason Top 25 after a first-round exit. A likely tournament team, but not an ACC favorite.",
      "at": "2026-09-29"
    },
    "mcbb_ohio_state": {
      "text": "A 21-win first-round team. Likely a bubble team in the Big Ten.",
      "at": "2026-09-29"
    },
    "mcbb_oregon": {
      "text": "12-20 and 5-15 in the Big Ten. Strong candidate to miss the tournament (-2) and finish near the bottom of the conference (-3).",
      "at": "2026-09-29"
    },
    "mcbb_purdue": {
      "text": "An Elite Eight team that returns five of its top nine scorers, including C.J. Cox; preseason No. 25. A dependable tournament team.",
      "at": "2026-09-29"
    },
    "mcbb_saint_mary_s": {
      "text": "27-6 and 16-2 in conference. With Gonzaga gone to the Pac-12, they're a leading WCC contender, and conference titles are where the points are.",
      "at": "2026-09-29"
    },
    "mcbb_san_diego_state": {
      "text": "22-11 but missed the tournament. A bubble team in its conference.",
      "at": "2026-09-29"
    },
    "mcbb_slu": {
      "text": "29-6 and a second-round team. A contender for its conference titles, which is where the points are.",
      "at": "2026-09-29"
    },
    "mcbb_st_johns": {
      "text": "Went 18-2 in the Big East and adds Auburn transfer Keyshawn Hall to Ian Jackson. Preseason No. 13; a strong Big East contender.",
      "at": "2026-09-29"
    },
    "mcbb_tennessee": {
      "text": "Adds Wake Forest transfer Juke Harris to Dewayne Brown II after an Elite Eight run. Preseason No. 15 and ninth in title odds.",
      "at": "2026-09-29"
    },
    "mcbb_texas": {
      "text": "Returns top scorer Matas Vokietaitis and adds five-star Marcus Spears Jr.; CBS ranks them fifth and books fifth. After a 9-9 SEC year, a big step up is expected.",
      "at": "2026-09-29"
    },
    "mcbb_texas_a_and_m": {
      "text": "A 22-win second-round team. A likely bubble-to-tournament team in the SEC.",
      "at": "2026-09-29"
    },
    "mcbb_texas_tech": {
      "text": "A 23-win tournament team that books still rate highly (13th in title odds). Likely back in the tournament; the Big 12 title is a stretch.",
      "at": "2026-09-29"
    },
    "mcbb_ucla": {
      "text": "Returns Trent Perry, Eric Dailey Jr. and Xavier Booker and ranks 20th preseason. A solid tournament bet in the Big Ten.",
      "at": "2026-09-29"
    },
    "mcbb_uconn": {
      "text": "Last year's national runners-up return Braylon Mullins and Silas Demary. Top-five preseason and third in title odds; a strong Big East regular-season bet.",
      "at": "2026-09-29"
    },
    "mcbb_utah_state": {
      "text": "29-7 and a second-round team. A contender for its conference titles, which is where the points are.",
      "at": "2026-09-29"
    },
    "mcbb_vanderbilt": {
      "text": "27-9 and a second-round team last year. A likely tournament team in a deep SEC.",
      "at": "2026-09-29"
    },
    "mcbb_villanova": {
      "text": "A 24-win tournament team that went 15-5 in the Big East. Likely back in the tournament.",
      "at": "2026-09-29"
    },
    "mcbb_virginia": {
      "text": "A 30-6 team that returns Thijs De Ridder and Sam Lewis among five of its top ten scorers. Ninth preseason; an ACC title contender behind Duke.",
      "at": "2026-09-29"
    },
    "mcbb_wisconsin": {
      "text": "A 24-win tournament team that fell in the first round. Likely back on the bubble or better in the Big Ten.",
      "at": "2026-09-29"
    },
    "mcbb_xavier": {
      "text": "15-18 and 6-14 in the Big East. Likely to miss the tournament (-2), with last place (-3) a risk.",
      "at": "2026-09-29"
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
    "wnba_aces": {
      "text": "A'ja Wilson led the league in scoring and blocks again, and some think the 2026 title runs through Las Vegas. As long as Wilson is there, they're a safe playoff bet and a title threat.",
      "at": "2026-09-29"
    },
    "wnba_dream": {
      "text": "Top seed in the East at 30-14. A proven regular-season team; they should contend for a top-two record again next year.",
      "at": "2026-09-29"
    },
    "wnba_fever": {
      "text": "Caitlin Clark and Kelsey Mitchell powered the highest-scoring offense in league history (96 points per game). Health (Clark's back, Aliyah Boston's leg) is the question, but they're a strong playoff bet for 2027.",
      "at": "2026-09-29"
    },
    "wnba_fire": {
      "text": "An expansion team that went 17-27 in year one, respectable for a new club. Still more likely to miss the playoffs (-3) than make them in 2027.",
      "at": "2026-09-29"
    },
    "wnba_liberty": {
      "text": "A 26-18 playoff team whose injuries kept them from ever settling on a lineup. More talented than their record; a healthier season could put them back in the title mix.",
      "at": "2026-09-29"
    },
    "wnba_lynx": {
      "text": "The league's best record at 33-11 and top seed in the West. A consistent contender that should be in the top-two record race (+2) again in 2027.",
      "at": "2026-09-29"
    },
    "wnba_mercury": {
      "text": "Slumped to 16-28 and missed the playoffs. They need a rebound offseason; missing the playoffs again (-3) is the likelier outcome.",
      "at": "2026-09-29"
    },
    "wnba_mystics": {
      "text": "A surprising 28-16 and second in the East. A young team on the rise, but they'll need to show it wasn't a one-off.",
      "at": "2026-09-29"
    },
    "wnba_sky": {
      "text": "16-28 and out of the playoffs again. Still rebuilding; missing the playoffs (-3) is likely in 2027.",
      "at": "2026-09-29"
    },
    "wnba_sparks": {
      "text": "16-28 and sixth in the West. A lottery-level team that will likely miss the playoffs again (-3).",
      "at": "2026-09-29"
    },
    "wnba_storm": {
      "text": "8-36, the worst record in the league. The favorite for a bottom-three finish (-2) and missing the playoffs (-3) again.",
      "at": "2026-09-29"
    },
    "wnba_sun": {
      "text": "11-33, one of the league's worst records, and in a rebuild. Strong candidate for a bottom-three record (-2) and missing the playoffs (-3).",
      "at": "2026-09-29"
    },
    "wnba_tempo": {
      "text": "An expansion team that went 11-33 in year one. Improvement is likely, but a bottom-three record (-2) and missing the playoffs (-3) remain the likeliest outcomes.",
      "at": "2026-09-29"
    },
    "wnba_valkyries": {
      "text": "A remarkable 32-12 in only their second season, good for second in the West. If that holds, they're a strong bet for playoff points again in 2027.",
      "at": "2026-09-29"
    },
    "wnba_wings": {
      "text": "Made the playoffs at 27-17 despite a brutal run of injuries, including 2026 No. 1 pick Azzi Fudd. With a healthier roster they could climb in 2027.",
      "at": "2026-09-29"
    }
  }
};
