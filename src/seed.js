// Starting course content, taken from the syllabus and the Week 1 pilot package.
// Everything is editable in the app. All borrowers and figures are fictional.

const WEEKS = [
  [1, 'Credit analysis foundations', 'Explain what a credit analyst does, the lending cycle, the 5 Cs of credit, and the main types of business loans.'],
  [2, 'Reading financial statements', 'Read an income statement, balance sheet and cash flow statement, and spread them into a standard format.'],
  [3, 'Ratio and cash flow analysis', 'Calculate and interpret liquidity, leverage, profitability and coverage ratios, and measure repayment capacity.'],
  [4, 'Industry, management and risk', 'Assess industry conditions, management quality and the main risks to repayment, and assign a risk rating.'],
  [5, 'Loan structuring, collateral and covenants', 'Structure a loan (amount, term, pricing, repayment), value collateral, and choose covenants that protect the bank.'],
  [6, 'Writing the credit memo', 'Pull the analysis together into a clear, recommendation-led credit memo.'],
  [7, 'Build a simulated loan file', 'Work a complete loan request from intake to recommendation, the way it happens at a bank.'],
  [8, 'Mock credit committee and job prep', 'Defend a recommendation under questioning and leave ready to apply for jobs.'],
];

const L = (...lines) => lines.join('\n');

const WEEK1 = [
  { kind: 'video', title: "Video 1: The credit analyst's job and the lending process",
    body: 'About 15 minutes. The video will be added here by your instructor.' },
  { kind: 'video', title: 'Video 2: The 5 Cs of credit',
    body: 'About 18 minutes. The video will be added here by your instructor.' },
  { kind: 'video', title: 'Video 3: Common business loan types',
    body: 'About 15 minutes. The video will be added here by your instructor.' },
  { kind: 'reading', title: 'Reading: What a credit analyst does',
    body: L(
      'A credit analyst helps a lender answer one question: if we lend this money, will we be repaid, and on what terms? The analyst gathers information about the borrower, tests it, and writes a recommendation that a credit officer or committee uses to approve, change or decline the loan.',
      '',
      '## From request to decision',
      '1. **Intake.** The borrower, usually through a relationship manager, submits a request and documents: an application, financial statements, tax returns, and details about collateral and owners.',
      '2. **Analysis.** The analyst checks the documents are complete, reviews the financial statements, calculates ratios and measures cash flow, and studies the industry and the owners.',
      '3. **Structuring.** The analyst proposes the amount, term, repayment, collateral and conditions that fit the borrower\'s cash flow and risk.',
      '4. **Credit memo.** The analyst writes the findings and a clear recommendation.',
      '5. **Approval.** A credit officer or committee reviews the memo, asks questions, and decides.',
      '6. **Closing and monitoring.** Documents are signed and the loan is funded. After that, the bank tracks financial reports and covenants for the life of the loan.',
      '',
      '## The 5 Cs of credit',
      'The 5 Cs are a checklist that keeps the analysis complete. A good memo says something about each one.',
      '- **Character:** the borrower\'s willingness to repay. Evidence: credit history, track record with other lenders, honesty and completeness of the application, reputation.',
      '- **Capacity:** the ability to repay from cash flow. Evidence: profit and cash flow trends, debt service coverage, how steady revenue is.',
      '- **Capital:** the owners\' own money at risk. Evidence: equity in the business, how much the owners are investing in this project, leverage compared with peers.',
      '- **Collateral:** the backup source of repayment. Evidence: the asset pledged, its value, how easy it is to sell, and the bank\'s lien position.',
      '- **Conditions:** outside factors. Evidence: the state of the industry and economy, the purpose of the loan, and the terms being asked for.',
      '',
      'The key idea: **repayment should come from cash flow first, collateral second.** Collateral is a safety net, not a reason to lend to a business that cannot pay.',
      '',
      '## Common business loan types',
      '- **Term loan:** equipment, expansion, acquisitions. Fixed payments over a set term.',
      '- **Revolving line of credit:** day-to-day working capital and seasonal swings. Interest is paid regularly; the balance goes up and down.',
      '- **Commercial real estate loan:** buying or refinancing property. Long amortization, often with a balloon payment.',
      '- **SBA-guaranteed loan:** small businesses that may not qualify for a standard loan. Terms are set by SBA program rules.',
      '',
      '## Why this matters for your career',
      'Every later week builds on this frame. When you spread statements in Week 2 or write your memo in Week 6, you are answering the same question: will this borrower repay, and how do we protect the bank if things go wrong?'
    ) },
  { kind: 'reading', title: 'Sample loan requests (fictional)',
    body: L(
      'All businesses, people and figures below are invented for teaching.',
      '',
      '## Request A: Maple Street Bakery LLC',
      'A 6-year-old bakery with two shops asks for **$180,000** to buy a new industrial oven and a delivery van. Sales were $1.2 million last year, up 4%. The owner, who has run the business since the start, has paid two previous equipment loans on time. She will put in $40,000 of her own savings. The oven and van will be the collateral. Local bakery competition is increasing, and a large grocery chain recently opened an in-store bakery nearby.',
      '',
      '## Request B: Northline Freight Services Inc.',
      'A 2-year-old trucking company asks for a **$250,000 revolving line of credit** to cover fuel and driver payroll while customers take 60 to 75 days to pay. Revenue doubled last year to $2.8 million, but the company lost money. Two customers make up 70% of sales. The owner has 8 years of industry experience but a personal credit history with two late payments in the past 3 years. Receivables and trucks would be the collateral.',
      '',
      '## Request C: Greenfield Dental Partners LLC',
      'A 12-year-old dental practice asks for **$900,000** to buy the building it currently rents. Profits have been steady for five years. The practice would pay about the same each month as it pays in rent now. The owners will provide a 20% down payment. The building is in a growing suburb and an independent estimate values it at $1.05 million. One of the two dentist-owners plans to retire in about four years.'
    ) },
  { kind: 'reading', title: 'Glossary of credit terms',
    body: L(
      '- **Borrower:** the person or company asking for the loan',
      '- **Collateral:** an asset pledged to the lender as backup repayment',
      '- **Covenant:** a promise in the loan agreement, such as keeping a minimum cash flow level',
      '- **Credit memo:** the analyst\'s written findings and recommendation',
      '- **Guarantor:** a person or company that promises to repay if the borrower cannot',
      '- **Lien:** the lender\'s legal claim on pledged collateral',
      '- **Amortization:** repaying a loan gradually through regular payments',
      '- **Working capital:** money used for day-to-day operations',
      '- **Receivables:** money customers owe the business',
      '- **Equity:** the owners\' own investment in the business'
    ) },
  { kind: 'live', title: 'Live session with Osman',
    body: 'About 75 minutes. Walk through one sample request, then questions and answers. Your instructor will post the date, time and meeting link here.' },
  { kind: 'assignment', title: 'Assignment: Classify and assess three loan requests',
    body: L(
      'Using Requests A, B and C, write one short section (about 150 to 200 words) per request that covers:',
      '1. The loan type being requested, and whether it fits the stated purpose',
      '2. One strength and one weakness for each of the 5 Cs, based only on the facts given',
      '3. The two biggest risks to repayment',
      '4. One question you would ask the borrower before going further',
      '',
      'Submit as a single document by the end of the week. Use the facts in the request, and say "not enough information" when a C cannot be judged.',
      '',
      '## How it is scored (100 points)',
      '- Loan type and fit: 20',
      '- 5 Cs analysis: 35',
      '- Key risks: 20',
      '- Borrower question: 10',
      '- Writing: 15'
    ) },
  { kind: 'note', staffOnly: true, title: 'Instructor notes for Osman (not visible to students)',
    body: L(
      'Nothing in Week 1 has been checked by a practicing credit analyst yet. Please review before any student sees it.',
      '',
      '## Suggested strong answers (to be confirmed)',
      '- **Request A (bakery):** term loan, fits an equipment purchase. Strengths: repayment history, owner investment. Risks: new in-store competition from a grocery chain, slow sales growth of 4%.',
      '- **Request B (freight):** line of credit fits the payroll and fuel timing gap. Risks: losses despite growth, 70% of sales from two customers, owner\'s late payments (character).',
      '- **Request C (dental):** commercial real estate loan, fits. Strengths: steady profits, payment about equal to current rent, 20% down, appraisal above the loan. Risk: one owner retiring in about four years.',
      '',
      '## To verify',
      '- Is the six-step process accurate for the banks you know?',
      '- Are the 5 Cs defined the way your employers used them?',
      '- Which other loan types belong in Week 1 (equipment finance, construction, asset-based)?',
      '- Do the three sample requests feel realistic in size, terms and risks?',
      '- Which real-world stories could be added, without naming any bank or customer?'
    ) },
];


const QUIZ1 = [
  ['What is the main question a credit analyst answers?', ['Is the borrower friendly?', 'Will the loan be repaid, and on what terms?', 'How much interest can we charge?', 'Can the borrower buy more assets?'], 1, 'The role is to judge repayment and support a decision.'],
  ['Which step comes right after analysis?', ['Closing', 'Intake', 'Structuring', 'Monitoring'], 2, 'Order: intake, analysis, structuring, memo, approval, closing and monitoring.'],
  ['Which C describes the borrower\'s willingness to repay?', ['Character', 'Capital', 'Collateral', 'Conditions'], 0, 'Character covers history and honesty.'],
  ['Which C is usually considered most important?', ['Collateral', 'Capacity', 'Conditions', 'Capital'], 1, 'Repayment should come from cash flow first.'],
  ['An owner invests 30% of the purchase price from savings. Which C does this strengthen?', ['Character', 'Conditions', 'Capital', 'Capacity'], 2, 'It is the owner\'s own money at risk.'],
  ['A shrinking industry mainly affects which C?', ['Capital', 'Conditions', 'Collateral', 'Character'], 1, 'Outside factors are Conditions.'],
  ['Which loan type fits seasonal working capital needs?', ['Term loan', 'Commercial real estate loan', 'Revolving line of credit', 'Equipment lease'], 2, 'A line can be drawn and repaid as needs change.'],
  ['Why is collateral called a backup source of repayment?', ['It replaces cash flow', 'It is used only if cash flow fails', 'It is always worth more than the loan', 'It is paid first'], 1, 'Cash flow is the first source of repayment.'],
  ['A borrower omits an existing debt from the application. This is mainly a concern about:', ['Capacity', 'Conditions', 'Character', 'Collateral'], 2, 'Honesty and completeness reflect character.'],
  ['Which pairing of purpose and loan type is a mismatch?', ['Seasonal payroll with a line of credit', 'Building purchase with a short-term line of credit', 'New oven with a term loan', 'Property purchase with a real estate loan'], 1, 'A long-term asset should not rely on short-term, revolving money.'],
];

async function seedQuiz(q) {
  const w1 = (await q('SELECT id FROM weeks WHERE number = 1')).rows[0];
  if (!w1) return;
  const has = (await q('SELECT 1 FROM quizzes WHERE week_id = $1', [w1.id])).rows[0];
  if (has) return;
  const z = (await q('INSERT INTO quizzes (week_id, title, pass_mark) VALUES ($1,$2,70) RETURNING id', [w1.id, 'Week 1 quiz: terms and the 5 Cs'])).rows[0];
  let pos = 1;
  for (const [prompt, options, correct, why] of QUIZ1) {
    await q('INSERT INTO quiz_questions (quiz_id, position, prompt, options, correct, explanation) VALUES ($1,$2,$3,$4,$5,$6)',
      [z.id, pos++, prompt, JSON.stringify(options), correct, why]);
  }
}

async function seed(q) {
  const w = await q('SELECT count(*)::int AS n FROM weeks');
  if (w.rows[0].n === 0) {
    for (const [n, title, obj] of WEEKS) {
      await q('INSERT INTO weeks (number, title, objectives) VALUES ($1,$2,$3)', [n, title, obj]);
    }
  }
  const w1 = await q('SELECT id FROM weeks WHERE number = 1');
  if (w1.rows[0]) {
    const c = await q('SELECT count(*)::int AS n FROM items WHERE week_id = $1', [w1.rows[0].id]);
    if (c.rows[0].n === 0) {
      let pos = 1;
      for (const it of WEEK1) {
        await q('INSERT INTO items (week_id, position, kind, title, body, staff_only) VALUES ($1,$2,$3,$4,$5,$6)',
          [w1.rows[0].id, pos++, it.kind, it.title, it.body, !!it.staffOnly]);
      }
    }
  }
}

module.exports = { seed: async (q) => { await seed(q); await seedQuiz(q); } };
