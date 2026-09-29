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
      "text": "Marco Rose takes over a side that finished sixth, but they are winless after five and playing more cautiously. A repeat European run looks unlikely; midtable is the realistic range.",
      "at": "2026-09-29"
    },
    "epl_arsenal": {
      "text": "The champions added Bruno Guimarães and remain title favorites for most previews, unbeaten through five. Mikel Arteta's side is the steadiest bet for a top-two finish (+6 or +9) and another Champions League campaign.",
      "at": "2026-09-29"
    },
    "epl_aston_villa": {
      "text": "Kept their Champions League place but lost key midfielders and defenders over the summer, and one win in five shows it. Unai Emery's record says they recover; a European finish is likely, top three a stretch.",
      "at": "2026-09-29"
    },
    "epl_brentford": {
      "text": "Fourth in the early table and one of the league's most stable clubs under Keith Andrews after a ninth-place finish. A top-half side with a small chance at Europe.",
      "at": "2026-09-29"
    },
    "epl_brighton": {
      "text": "Third in the early table under Fabian Hürzeler after an eighth-place finish. European football will test their depth, but a top-half finish with a shot at Europe (+3) looks realistic.",
      "at": "2026-09-29"
    },
    "epl_chelsea": {
      "text": "Xabi Alonso takes over a talented but inconsistent squad that finished tenth last season. Cole Palmer's scoring is the swing factor; a return to the European places is the realistic target.",
      "at": "2026-09-29"
    },
    "epl_coventry_city": {
      "text": "Frank Lampard has them back in the top flight for the first time in 25 years, with Haji Wright up front. One win in five already; previews rate them one of the likelier sides to go straight back down (-5).",
      "at": "2026-09-29"
    },
    "epl_crystal_palace": {
      "text": "Lost Oliver Glasner plus defenders Marc Guéhi and Maxence Lacroix; Pierre Sage now manages a thinner squad juggling Europe. After 15th last season, they could be drawn into a relegation fight.",
      "at": "2026-09-29"
    },
    "epl_everton": {
      "text": "David Moyes has added solid depth such as Christian Nørgaard and Brennan Johnson after a 13th-place finish. Comfortably midtable is the expectation, with little risk of the drop.",
      "at": "2026-09-29"
    },
    "epl_fulham": {
      "text": "Álvaro Arbeloa is an unproven replacement for Marco Silva, and Fulham sit near the bottom without a win in five. Previews see a step down; a relegation fight is possible.",
      "at": "2026-09-29"
    },
    "epl_hull_city": {
      "text": "Previews rated them among the weakest promoted sides, though they've started better than expected (two wins in five). Still a leading relegation candidate, which costs -5.",
      "at": "2026-09-29"
    },
    "epl_ipswich_town": {
      "text": "Back up after one season away, under Gary O'Neil and with memories of their last quick relegation. Two wins from five is a decent start, but survival is far from assured, and relegation costs -5.",
      "at": "2026-09-29"
    },
    "epl_leeds_united": {
      "text": "Fifth in the early table, and goalkeeper James Trafford's arrival steadies a side that finished 14th. Daniel Farke's team looks safe from relegation, with a top-half finish possible.",
      "at": "2026-09-29"
    },
    "epl_liverpool": {
      "text": "A reset year: Arne Slot and Mohamed Salah are gone, and Andoni Iraola starts with Alexander Isak and Florian Wirtz leading the attack. Two wins and three draws has them sixth; top four is realistic, a title push less so.",
      "at": "2026-09-29"
    },
    "epl_manchester_city": {
      "text": "Life after Pep Guardiola and Rodri has started perfectly: five wins from five under Enzo Maresca, with Erling Haaland leading the league. A genuine title contender again, and a strong bet for top three.",
      "at": "2026-09-29"
    },
    "epl_manchester_united": {
      "text": "Third last season, and Michael Carrick's first full year added Youri Tielemans without losing much. Some previews rank them second, but a slow start (one win in five) means a top-three repeat has to be earned.",
      "at": "2026-09-29"
    },
    "epl_newcastle": {
      "text": "Matthias Jaissle took over when Eddie Howe stepped down on July 31, and the summer also cost them Sandro Tonali, Bruno Guimarães and Anthony Gordon. After a 12th-place finish, scoring goals is the big question; midtable is the likeliest outcome.",
      "at": "2026-09-29"
    },
    "epl_nottingham": {
      "text": "Oliver Glasner has taken over after a 16th-place scare, and the owners are willing to spend. Expect a climb toward midtable or better; relegation looks less likely than last year.",
      "at": "2026-09-29"
    },
    "epl_sunderland": {
      "text": "Seventh last season earned a Europa League place, but a quiet summer and a tight rotation under Régis Le Bris risk fatigue. One win in five; midtable is likelier than another European finish.",
      "at": "2026-09-29"
    },
    "epl_tottenham_hotspur": {
      "text": "Roberto De Zerbi inherits a side that finished 17th and is winless in five, near the bottom again. Previews say the squad lacks attacking signings; relegation (-5) is a real, if unlikely, risk.",
      "at": "2026-09-29"
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
      "at": "2026-09-29"
    },
    "mlb_astros": {
      "text": "Won the AL West at just 81-81 and made the playoffs. An aging core in a division where Seattle and Texas should improve; repeating as division champs is far from certain.",
      "at": "2026-09-29"
    },
    "mlb_athletics": {
      "text": "64-98, fourth in the AL West. Still years from contention; last place in the division (-2) and the AL's worst record (-3) are both in play.",
      "at": "2026-09-29"
    },
    "mlb_blue_jays": {
      "text": "Recent World Series participants who slipped to 79-83. Previews expect a bounce-back: Vladimir Guerrero Jr. anchors a front office that spends aggressively.",
      "at": "2026-09-29"
    },
    "mlb_braves": {
      "text": "Won the NL East at 94-68 and head into October as division champs. The core is intact for 2027, making them a solid bet for playoff and division points.",
      "at": "2026-09-29"
    },
    "mlb_brewers": {
      "text": "Won 103 games and the NL Central with a pitching staff led by Jacob Misiorowski, who projects as one of the game's best starters. A strong bet to contend for the NL's best record (+3) again.",
      "at": "2026-09-29"
    },
    "mlb_cardinals": {
      "text": "77-85, but a young roster that outperformed expectations; previews think one more starting pitcher makes them a 2027 contender in the NL Central.",
      "at": "2026-09-29"
    },
    "mlb_cubs": {
      "text": "Pete Crow-Armstrong is emerging as a superstar, but Seiya Suzuki is expected to leave in free agency. An 89-win playoff team that should contend in the NL Central behind Milwaukee.",
      "at": "2026-09-29"
    },
    "mlb_diamondbacks": {
      "text": "86 wins but missed the playoffs in a strong NL West. A fringe contender for 2027; a wild card is realistic, the division is not.",
      "at": "2026-09-29"
    },
    "mlb_dodgers": {
      "text": "Won 100 games and the NL West again, and remain the sport's deepest roster. Tarik Skubal is headed for free agency, but expect the Dodgers to spend; the division (+2) and a deep October run are the baseline for 2027.",
      "at": "2026-09-29"
    },
    "mlb_giants": {
      "text": "65-97 and fourth in a strong NL West. A long rebuild ahead; a leading candidate for last in the division (-2).",
      "at": "2026-09-29"
    },
    "mlb_guardians": {
      "text": "Won a weak AL Central at 85-77 and are into the ALDS. Division repeats are plausible, but the Royals and White Sox are closing in.",
      "at": "2026-09-29"
    },
    "mlb_mariners": {
      "text": "A disappointing 76-86, and Randy Arozarena is expected to leave in free agency. Julio Rodríguez, Cal Raleigh and deep pitching point to a bounce-back year in 2027.",
      "at": "2026-09-29"
    },
    "mlb_marlins": {
      "text": "80-82, third in the NL East behind Atlanta and Philadelphia. Likely a middle-of-the-pack team in 2027; a playoff spot would be a surprise.",
      "at": "2026-09-29"
    },
    "mlb_mets": {
      "text": "A disappointing 74-88, fifth in the NL East despite star power. Previews expect a big offseason spend; a bounce-back into the wild-card race is realistic.",
      "at": "2026-09-29"
    },
    "mlb_nationals": {
      "text": "77-85, fourth in the NL East. Still building; a playoff push in 2027 is unlikely, but last place isn't a given with the Mets struggling.",
      "at": "2026-09-29"
    },
    "mlb_orioles": {
      "text": "79-82 and fourth in the AL East, and ace Trevor Rogers is headed for free agency. Previews still think another big offseason around Pete Alonso makes them a 2027 contender.",
      "at": "2026-09-29"
    },
    "mlb_padres": {
      "text": "A 91-win wild-card team, but Michael King's opt-out and reliever Adrián Morejón's free agency could thin the pitching. Likely a playoff team again, behind the Dodgers in the NL West.",
      "at": "2026-09-29"
    },
    "mlb_phillies": {
      "text": "88 wins and a wild-card spot, second to Atlanta in the NL East. An experienced roster that should remain a playoff contender in 2027.",
      "at": "2026-09-29"
    },
    "mlb_pirates": {
      "text": "Finished 82-80, their first winning season in years, but Brandon Lowe (31 homers) is expected to leave in free agency. A fringe wild-card team for 2027.",
      "at": "2026-09-29"
    },
    "mlb_rangers": {
      "text": "80-82 and second in a weak AL West. With the Astros aging, the division is open, so they're a reasonable division-title sleeper.",
      "at": "2026-09-29"
    },
    "mlb_rays": {
      "text": "Won the AL East at 98-64 behind Junior Caminero, who has hit 40 homers in back-to-back years. Freddy Peralta hits free agency, but the core is young; a good bet for the playoffs again.",
      "at": "2026-09-29"
    },
    "mlb_red_sox": {
      "text": "An 87-win wild-card team in a strong AL East. Should contend for the playoffs again in 2027, with a division title a long shot behind Tampa and New York.",
      "at": "2026-09-29"
    },
    "mlb_reds": {
      "text": "75-87 and last in the NL Central. Young pitching gives them upside, but last place in the division (-2) is a real risk again.",
      "at": "2026-09-29"
    },
    "mlb_rockies": {
      "text": "58-104, the worst record in baseball. The clear favorite for last in the NL West (-2) and the NL's worst record (-3) again.",
      "at": "2026-09-29"
    },
    "mlb_royals": {
      "text": "69-93, last in the AL Central, but Bobby Witt Jr. is an MVP-level star and previews tip them to surprise in 2027 if they add outfield bats.",
      "at": "2026-09-29"
    },
    "mlb_tigers": {
      "text": "76-86 and fourth in the AL Central after years of contention, and Tarik Skubal is gone. Middle of the pack for 2027; the division is weak enough that it's not hopeless.",
      "at": "2026-09-29"
    },
    "mlb_twins": {
      "text": "77-85 and third in the AL Central, and catcher Ryan Jeffers is set to hit free agency. Likely a middle-of-the-pack team; the playoffs would be a surprise.",
      "at": "2026-09-29"
    },
    "mlb_white_sox": {
      "text": "The surprise of 2026: 84-78 and a wild-card spot after years at the bottom. Whether it holds up is the question, but the AL Central is winnable.",
      "at": "2026-09-29"
    },
    "mlb_yankees": {
      "text": "93 wins but second in the AL East behind Tampa Bay. Aaron Judge keeps them a perennial playoff team; the division title (+2) will be the hard part again.",
      "at": "2026-09-29"
    },
    "nba_76ers": {
      "text": "The summer's biggest swing: LeBron James and Jaylen Brown join Joel Embiid and Tyrese Maxey. Books have them third for the title, but health and chemistry make them the highest-variance contender.",
      "at": "2026-09-29"
    },
    "nba_blazers": {
      "text": "Traded for Ja Morant to join Damian Lillard and Scoot Henderson, and previews expect some growing pains. Likely a play-in team; the Northwest is out of reach.",
      "at": "2026-09-29"
    },
    "nba_bucks": {
      "text": "Traded Giannis Antetokounmpo to Miami and hired Taylor Jenkins to run a rebuild. Near-consensus bottom-two team; a leading candidate for last in the Central and the East's worst record.",
      "at": "2026-09-29"
    },
    "nba_bulls": {
      "text": "A rebuild built around Caleb Wilson and Matas Buzelis. Expect a lottery team; last place in the Central (-2) is the main risk.",
      "at": "2026-09-29"
    },
    "nba_cavaliers": {
      "text": "James Harden, Donovan Mitchell and Evan Mobley get a full season together after last year's run to the East finals. The Central is theirs to win (+160) if Detroit slips, and a top-four seed is likely.",
      "at": "2026-09-29"
    },
    "nba_celtics": {
      "text": "Jayson Tatum is back, and they traded Jaylen Brown for Paul George and added Mitchell Robinson after a 56-win season. Expect a top-four seed in the East; the Atlantic is a three-way fight with New York and Philadelphia.",
      "at": "2026-09-29"
    },
    "nba_clippers": {
      "text": "Lost Kawhi Leonard to Toronto and are short on draft picks after league penalties. Previews rank them near the bottom; last in the Pacific (-2) or the West's worst record (-3) are real risks.",
      "at": "2026-09-29"
    },
    "nba_grizzlies": {
      "text": "Traded Ja Morant and are starting over around rookie Cam Boozer and Zach Edey. A rebuilding year; last in the Southwest (-2) and the West's worst record (-3) are both on the table.",
      "at": "2026-09-29"
    },
    "nba_hawks": {
      "text": "Life after Trae Young: a fast-paced team built around Jalen Johnson, with Lu Dort added. Previews have them around the East's play-in line; a playoff spot is possible but hardly safe.",
      "at": "2026-09-29"
    },
    "nba_heat": {
      "text": "Landed Giannis Antetokounmpo to pair with Bam Adebayo, which should make them a strong defensive team. Shooting is the question; books rate them a real East threat at +950.",
      "at": "2026-09-29"
    },
    "nba_hornets": {
      "text": "Traded LaMelo Ball to Minnesota and are leaning on Brandon Miller, Kon Knueppel and a deep bench. A play-in contender at best; missing the playoffs is the likelier result.",
      "at": "2026-09-29"
    },
    "nba_jazz": {
      "text": "Rookie Darryn Peterson joins Lauri Markkanen and Jaren Jackson Jr., and some previews call them a sleeper. Still a long way from the Northwest's top; avoiding last place (-2) is the realistic bar.",
      "at": "2026-09-29"
    },
    "nba_kings": {
      "text": "Domantas Sabonis, Zach LaVine and rookie Darius Acuff Jr. can score, but previews call the defense historically bad. Ranked last in most previews: a prime candidate for the West's worst record (-3).",
      "at": "2026-09-29"
    },
    "nba_knicks": {
      "text": "The defending champions bring back nearly the whole title roster, minus Mitchell Robinson, who left for Boston. A top-three team in every preview and slight favorites in the Atlantic (+160).",
      "at": "2026-09-29"
    },
    "nba_lakers": {
      "text": "Luka Dončić's team now, with LeBron gone and Walker Kessler added to protect the rim. Books favor them to win the Pacific (-130), which makes division points a realistic target.",
      "at": "2026-09-29"
    },
    "nba_magic": {
      "text": "Paolo Banchero and Franz Wagner headline an expensive roster that underachieved last season. Previews see them as a mid-pack East playoff team, not a contender.",
      "at": "2026-09-29"
    },
    "nba_mavericks": {
      "text": "Cooper Flagg's second season depends on Kyrie Irving coming back healthy. After a 26-win year they're a lottery-to-play-in team; last in the Southwest (-2) is a real risk.",
      "at": "2026-09-29"
    },
    "nba_nets": {
      "text": "Julius Randle leads a young, rebuilding roster, and books have them as the longest shot for the title. Strong candidates for last in the Atlantic (-2) and the East's worst record (-3).",
      "at": "2026-09-29"
    },
    "nba_nuggets": {
      "text": "Nikola Jokić is still the league's best player, but the supporting cast was reshuffled over the summer. A playoff team for sure; how far they go depends on the new pieces fitting around him.",
      "at": "2026-09-29"
    },
    "nba_pacers": {
      "text": "Tyrese Haliburton returns from his Achilles injury, with Ivica Zubac and Kelly Oubre Jr. added. After a 19-63 year without him, a return to the playoffs is realistic if he's himself.",
      "at": "2026-09-29"
    },
    "nba_pelicans": {
      "text": "Hoping Dejounte Murray's return from an Achilles tear steadies a roster built around Zion Williamson. Previews project a lottery team; last in the Southwest (-2) is in play.",
      "at": "2026-09-29"
    },
    "nba_pistons": {
      "text": "Last season's East No. 1 seed at 60-22, built around Cade Cunningham and Jalen Duren. Even-money favorites in the Central, and a realistic contender for the East's best record (+3) again.",
      "at": "2026-09-29"
    },
    "nba_raptors": {
      "text": "Kawhi Leonard is back in Toronto alongside Scottie Barnes, and some previews rank them top six. If Leonard stays healthy they're a playoff lock; the Atlantic is crowded, though.",
      "at": "2026-09-29"
    },
    "nba_rockets": {
      "text": "A deep roster built around Alperen Şengün, Amen Thompson and Kevin Durant. Solid bet for the playoffs, but the Spurs make the Southwest (+750) a long shot.",
      "at": "2026-09-29"
    },
    "nba_spurs": {
      "text": "Last year's runners-up are many previews' No. 1, with Victor Wembanyama at an MVP level and Tobias Harris added. Heavy Southwest favorites (-1200), so division points are close to banked and a deep run is likely.",
      "at": "2026-09-29"
    },
    "nba_suns": {
      "text": "Devin Booker's team has health questions around Jalen Green and Mark Williams. Previews see a fringe play-in team, though the Pacific (+265) is weaker than it looks.",
      "at": "2026-09-29"
    },
    "nba_thunder": {
      "text": "Co-favorites for the title with Shai Gilgeous-Alexander still the league's toughest cover, though they moved on from Lu Dort, Isaiah Joe and Aaron Wiggins. A safe bet for the Northwest (+2) and a strong one for the West's best record (+3).",
      "at": "2026-09-29"
    },
    "nba_timberwolves": {
      "text": "Traded Julius Randle and brought in LaMelo Ball to pair with Anthony Edwards. High ceiling if Ball settles in, but the Northwest belongs to Oklahoma City; think playoffs and a possible second-round run.",
      "at": "2026-09-29"
    },
    "nba_warriors": {
      "text": "Stephen Curry's supporting cast is aging (Draymond Green is 36, Al Horford 40) and Kristaps Porziņģis is injury-prone. Previews project a play-in team, and last place in the Pacific (-2) isn't out of the question.",
      "at": "2026-09-29"
    },
    "nba_wizards": {
      "text": "Added Trae Young to a veteran-heavy build (Khris Middleton, Deandre Ayton) after a 17-65 season, and previews call the fit confusing. Still near the bottom of the East, so last in the Southeast (-2) is a strong possibility.",
      "at": "2026-09-29"
    },
    "nfl_49ers": {
      "text": "Brock Purdy is playing at an MVP level and George Kittle is back from his Achilles, so a 3-0 start looks real. The NFC West runs through them, and the top NFC seed (+3) is in play if the injuries stay manageable.",
      "at": "2026-09-29"
    },
    "nfl_bears": {
      "text": "Caleb Williams is out three to four weeks with a hamstring strain, so 38-year-old Case Keenum is starting. A 2-1 start gives them a cushion, but repeating as NFC North champs depends on treading water until Williams returns.",
      "at": "2026-09-29"
    },
    "nfl_bengals": {
      "text": "The offense can keep them in any game, but the defense just let Aaron Rodgers' Steelers put up 30. A playoff spot is realistic; the AFC North title (+2) means getting past a Ravens team that books still favor.",
      "at": "2026-09-29"
    },
    "nfl_bills": {
      "text": "Books' second favorite for the Super Bowl and heavy AFC East favorites, with Josh Allen 3-0 even on off days and Dalton Kincaid emerging as his top target. Among the safest bets for playoff and division points.",
      "at": "2026-09-29"
    },
    "nfl_broncos": {
      "text": "Last year's 14-3 AFC West champs lean on their defense while Courtland Sutton and the offense sputter. The Chiefs are back to 3-0, so the division (+2) is a real fight, but a playoff spot looks likely.",
      "at": "2026-09-29"
    },
    "nfl_browns": {
      "text": "A surprise 2-1 start behind a defense that's playing well together. Still long shots in a division with the Ravens and Bengals; the draw is avoiding last place (-2) more than chasing a title.",
      "at": "2026-09-29"
    },
    "nfl_bucs": {
      "text": "0-3 and Baker Mayfield is out at least three weeks with a thumb injury, leaving rookie Jalon Daniels under center. The NFC South is weak enough to recover in, but last place in the division (-2) is a real risk right now.",
      "at": "2026-09-29"
    },
    "nfl_cardinals": {
      "text": "Jacoby Brissett has been steadier than expected, but after a 3-14 season this is still one of the NFL's thinnest rosters. Books have them near the bottom; last place in the NFC West (-2) is the likeliest outcome.",
      "at": "2026-09-29"
    },
    "nfl_chargers": {
      "text": "0-3 with three turnovers in their last loss and Omarion Hampton struggling to carry the run game. A playoff team last year, but books now put them 19th in the Super Bowl market and the AFC West looks out of reach.",
      "at": "2026-09-29"
    },
    "nfl_chiefs": {
      "text": "Back to form after a 6-11 year: 3-0, Patrick Mahomes in control, and Kenneth Walker III giving them a real run game. Books make them AFC West favorites again, so division (+2) and playoff points are well within reach.",
      "at": "2026-09-29"
    },
    "nfl_colts": {
      "text": "Daniel Jones is back from his Achilles but turning the ball over, and the defense and kicker have had to win games. They look like a middle-of-the-pack AFC South team, with a wild-card spot possible but far from safe.",
      "at": "2026-09-29"
    },
    "nfl_commanders": {
      "text": "Jayden Daniels is hurt, but Marcus Mariota just led an upset of the champion Seahawks. After a 5-12 year, a playoff push depends on Daniels' timeline; the NFC East is open with the Eagles and Cowboys wobbling.",
      "at": "2026-09-29"
    },
    "nfl_cowboys": {
      "text": "Dak Prescott is playing at a Pro Bowl level, but late-game defense has cost them twice already. Books still rate them the Eagles' main NFC East rival, and a wild-card spot looks realistic if the defense firms up.",
      "at": "2026-09-29"
    },
    "nfl_dolphins": {
      "text": "Books' longest shot in the league at +100000 after an 0-3 start, with De'Von Achane lost to a torn ACL. Strong candidates for last in the AFC East (-2) and the conference's worst record (-3).",
      "at": "2026-09-29"
    },
    "nfl_eagles": {
      "text": "Still NFC East favorites, but Jalen Hurts struggled badly in a loss to a Case Keenum-led Bears team. The division title (+2) is theirs to lose; whether they're a real Super Bowl threat again depends on the offense finding a rhythm.",
      "at": "2026-09-29"
    },
    "nfl_falcons": {
      "text": "Bijan Robinson carried them to a lopsided win over the Packers, but the quarterback spot is still unsettled. The NFC South is winnable, so they're a division sleeper even with long Super Bowl odds.",
      "at": "2026-09-29"
    },
    "nfl_giants": {
      "text": "Jaxson Dart is out for the season, so they traded for J.J. McCarthy just to steady the position. A 2-1 start is a bonus, but after a 4-13 year the NFC East basement (-2) is still the bigger risk.",
      "at": "2026-09-29"
    },
    "nfl_jaguars": {
      "text": "Last year's AFC South champs just dominated the Patriots, and Travis Hunter is making plays on defense. Books favor them to win the division again, which makes them solid value for playoff and division points.",
      "at": "2026-09-29"
    },
    "nfl_jets": {
      "text": "Showed fight in a comeback against the Lions, and rookie tight end Kenyon Sadiq looks like a real piece. Still rebuilding after a 3-14 season and stuck behind the Bills, so avoiding last in the AFC East (-2) is the goal.",
      "at": "2026-09-29"
    },
    "nfl_lions": {
      "text": "Jahmyr Gibbs is carrying the offense and Jared Goff is steady, but the defense keeps giving up fourth-quarter leads. After missing the playoffs last year they're a coin flip for the NFC North, now crowded with the 3-0 Vikings.",
      "at": "2026-09-29"
    },
    "nfl_packers": {
      "text": "A 21-point loss to the Falcons that Matt LaFleur called humbling, no running game, and Tucker Kraft still finding his way back from an ACL. Books have fallen off them fast; the playoffs look shaky in a deep NFC North.",
      "at": "2026-09-29"
    },
    "nfl_panthers": {
      "text": "Won the NFC South last year, but Bryce Young is banged up and the receivers are thin after Jalen Coker's injury. The division is open with Tampa Bay reeling, so they're a reasonable division-title flier.",
      "at": "2026-09-29"
    },
    "nfl_patriots": {
      "text": "Last year's AFC champs look lost at 1-2: Drake Maye is posting career-worst numbers without A.J. Brown. Books still give them the Bills' best AFC East challenge, but a return trip deep into January looks unlikely.",
      "at": "2026-09-29"
    },
    "nfl_raiders": {
      "text": "The surprise of the season at 3-0, with Kirk Cousins starting ahead of top pick Fernando Mendoza and Brock Bowers the focal point. After a 3-14 year, books still doubt them, making them a high-upside, high-risk pick.",
      "at": "2026-09-29"
    },
    "nfl_rams": {
      "text": "Books' Super Bowl favorites, but they blew a 16-0 halftime lead to Denver and Puka Nacua is nursing a groin injury. A 1-2 start is a blip for a roster this good; NFC West title and deep-run points are both realistic.",
      "at": "2026-09-29"
    },
    "nfl_ravens": {
      "text": "Lamar Jackson has the passing game humming again with Zay Flowers back, and books make them AFC North favorites and third in the Super Bowl market. Red-zone trouble is the only real knock after a disappointing 8-9 year.",
      "at": "2026-09-29"
    },
    "nfl_saints": {
      "text": "Tyler Shough is productive but faded late against the Raiders. Books actually make them slight favorites in a wide-open NFC South (+134), so there's more division-title upside here than their +8000 Super Bowl odds suggest.",
      "at": "2026-09-29"
    },
    "nfl_seahawks": {
      "text": "The defending champions, but Sam Darnold threw a pick-six in an upset loss to Washington. Still a strong NFC West contender and fifth in the Super Bowl market, with the Rams and 49ers making the division a three-way fight.",
      "at": "2026-09-29"
    },
    "nfl_steelers": {
      "text": "Aaron Rodgers finally opened up the passing game in a 30-point win over Cincinnati, and D.K. Metcalf is producing. Last year's AFC North champs are a wild-card-type team; books have the Ravens ahead of them.",
      "at": "2026-09-29"
    },
    "nfl_texans": {
      "text": "0-3 with no run game and too little at receiver for the defense to carry. A playoff team last year, but they're now the AFC South's biggest question mark; a slow start makes the division (+2) a long shot.",
      "at": "2026-09-29"
    },
    "nfl_titans": {
      "text": "0-3 and Cam Ward is still up and down in his second year. Books' second-longest shot, and the favorite for last in the AFC South (-2) and a contender for the AFC's worst record (-3).",
      "at": "2026-09-29"
    },
    "nfl_vikings": {
      "text": "3-0 on the back of an elite defense while the offense is inconsistent and Justin Jefferson nurses an ankle injury. Books now make them NFC North favorites (+144), just ahead of the Lions.",
      "at": "2026-09-29"
    },
    "nhl_avalanche": {
      "text": "Last season's Presidents' Trophy winners, ranked second or third in previews. Nathan MacKinnon and company should rack up regular-season points; the question is another playoff exit.",
      "at": "2026-09-29"
    },
    "nhl_blackhawks": {
      "text": "Connor Bedard is sidelined by a summer injury and not yet close to practicing. Lottery-bound in both previews, with last in the Central (-2) and the West's worst record (-3) in play.",
      "at": "2026-09-29"
    },
    "nhl_blue_jackets": {
      "text": "Swapped Kirill Marchenko for Matthew Knies, but Zach Werenski's contract is unresolved. A bubble team at best; missing the playoffs again is the likelier outcome.",
      "at": "2026-09-29"
    },
    "nhl_blues": {
      "text": "Scored too little last season and need goalie Joel Hofer to carry a heavy load. Previews rank them near the bottom of a strong Central, so last place in the division (-2) is a risk.",
      "at": "2026-09-29"
    },
    "nhl_bruins": {
      "text": "Reached 100 points last season under rookie coach Marco Sturm, but previews see them as overachievers with little behind David Pastrňák. A bubble team this year.",
      "at": "2026-09-29"
    },
    "nhl_canadiens": {
      "text": "Reached the East final last spring, added veteran Chris Kreider, and are ranked a Cup contender. A strong bet for playoff points, with a real shot at the Atlantic title.",
      "at": "2026-09-29"
    },
    "nhl_canucks": {
      "text": "Both previews rank them 32nd after a 25-49-8 season. The favorite for last in the Pacific (-2) and the West's worst record (-3).",
      "at": "2026-09-29"
    },
    "nhl_capitals": {
      "text": "Added Alex Tuch and Boone Jenner around Alex Ovechkin after missing the playoffs. Previews see them as a playoff team again, but the Metropolitan runs through Carolina.",
      "at": "2026-09-29"
    },
    "nhl_devils": {
      "text": "Jack Hughes' health and underwhelming goaltending are the big questions after a seventh-place finish. Talented enough for the playoffs if both hold up; a bubble team otherwise.",
      "at": "2026-09-29"
    },
    "nhl_ducks": {
      "text": "Reached the second round, but lost depth to an offer sheet over the summer. Leo Carlsson leads a solid top line; a bubble playoff team in the Pacific.",
      "at": "2026-09-29"
    },
    "nhl_flames": {
      "text": "The league's worst offense last season, with young goalie Dustin Wolf the bright spot. Previews expect a long year; a leading candidate for the West's worst record (-3).",
      "at": "2026-09-29"
    },
    "nhl_flyers": {
      "text": "A 98-point team last season with young talent like Matvei Michkov and Porter Martone, though previews question whether it's sustainable. On the playoff bubble.",
      "at": "2026-09-29"
    },
    "nhl_golden_knights": {
      "text": "Last season's Western Conference champions, now under new coach Ryan Craig, in a Pacific Division previews call weak. Good odds for division points (+2) and another long spring.",
      "at": "2026-09-29"
    },
    "nhl_hurricanes": {
      "text": "The Stanley Cup champions return almost the same roster and top both big preseason rankings. Strong favorites to repeat as Metropolitan champs (+2) and contend for the East's best record (+3).",
      "at": "2026-09-29"
    },
    "nhl_islanders": {
      "text": "Matthew Schaefer is a budding star, but the roster around him is thin and Mat Barzal is dealing with a knee injury. Likely outside the playoffs.",
      "at": "2026-09-29"
    },
    "nhl_jets": {
      "text": "Everything hinges on Connor Hellebuyck, whose availability is uncertain amid trade talk. After a seventh-place finish in the Central, missing the playoffs again is likely.",
      "at": "2026-09-29"
    },
    "nhl_kings": {
      "text": "Now built around Artemi Panarin, but last season's playoff spot looked fortunate and the supporting cast is thin. A bubble team in a weak Pacific.",
      "at": "2026-09-29"
    },
    "nhl_kraken": {
      "text": "Running back a largely unchanged roster that previews call uninspiring. Likely near the bottom of the Pacific, where last place (-2) is a real risk.",
      "at": "2026-09-29"
    },
    "nhl_lightning": {
      "text": "Consistently strong in the regular season, with Brayden Point expected to bounce back, but they have four straight first-round exits. A likely playoff team with limited deep-run upside.",
      "at": "2026-09-29"
    },
    "nhl_mammoth": {
      "text": "A loaded young roster with veteran additions; previews call them a dangerous playoff team. The Central is brutal, so a wild-card spot is likelier than the division.",
      "at": "2026-09-29"
    },
    "nhl_maple_leafs": {
      "text": "Finished last in the Atlantic after a 32-36-14 season. Auston Matthews has to rediscover his scoring and the aging defense and goaltending need to stay healthy; last in the division (-2) remains a risk.",
      "at": "2026-09-29"
    },
    "nhl_oilers": {
      "text": "Connor McDavid and Leon Draisaitl now play for Mike Babcock, and they went unbeaten in preseason. Still a top Pacific contender, though depth remains a worry.",
      "at": "2026-09-29"
    },
    "nhl_panthers": {
      "text": "Missed the playoffs last year, but Aleksander Barkov is healthy and they added Brady Tkachuk. Previews rank them a top-four team again, so expect a big rebound in the Atlantic.",
      "at": "2026-09-29"
    },
    "nhl_penguins": {
      "text": "Sidney Crosby is still elite and they had 98 points last season, but they made no major additions and lack a proven starting goalie. Previews expect some regression.",
      "at": "2026-09-29"
    },
    "nhl_predators": {
      "text": "An aging roster in need of a reset, with Mavrik Bourque and Matthew Wood as the young hope. Bottom-five in previews; a candidate for last in the Central (-2).",
      "at": "2026-09-29"
    },
    "nhl_rangers": {
      "text": "Traded Artemi Panarin after missing the playoffs, and previews call them a wild card that could miss again or surprise. Last in the Metropolitan (-2) is possible.",
      "at": "2026-09-29"
    },
    "nhl_red_wings": {
      "text": "Captain Dylan Larkin has requested a trade, which hangs over the season. Previews rank them in the bottom third; last in the Atlantic (-2) is a real possibility.",
      "at": "2026-09-29"
    },
    "nhl_sabres": {
      "text": "Ended a 14-year playoff drought by winning the Atlantic, led by Rasmus Dahlin and a young core. Previews expect another playoff trip, but repeating as division champs will be hard.",
      "at": "2026-09-29"
    },
    "nhl_senators": {
      "text": "Lost captain Brady Tkachuk to Florida, and Linus Ullmark's form in goal is a question. A bubble team at best after last season's playoff trip.",
      "at": "2026-09-29"
    },
    "nhl_sharks": {
      "text": "Macklin Celebrini, 20, is now captain, and rookie Ivar Stenberg was a preseason standout. Some previews have them third in the Pacific, a real playoff push after years of losing.",
      "at": "2026-09-29"
    },
    "nhl_stars": {
      "text": "Jason Robertson and a 50-win core, but three straight West final losses make this Cup-or-bust. Regular-season points are a safe bet; the Central is a fight with Colorado and Minnesota.",
      "at": "2026-09-29"
    },
    "nhl_wild": {
      "text": "Kirill Kaprizov and Matt Boldy lead an elite top six, though Quinn Hughes' contract future is a distraction. A solid playoff team in a tough Central.",
      "at": "2026-09-29"
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
