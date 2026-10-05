/**
 * Relentlessly Disciplined - 30-Day Practice Journal (Disciplined Disciples Academy)
 * Content for the online journal. Mirrors the printable journal written by Zolile Nomaqhiza.
 * Stage-specific wording lets the same journal serve APC/IAC candidates, students,
 * trainees and professionals in other fields.
 */
(function () {
    'use strict';

    var PRACTICES = [
        { key: 'meditation', label: 'Meditation / prayer / stillness', unit: 'min' },
        { key: 'exercise', label: 'Exercise / movement', unit: 'min' },
        { key: 'reading', label: 'Reading', unit: 'pages / min' },
        { key: 'writing', label: 'Writing / reflection', unit: 'min' },
        { key: 'study', label: 'Study / deep work', unit: 'min' } // label replaced per stage
    ];

    var STAGES = {
        apc: {
            label: 'APC candidate',
            study: 'APC study / research',
            reflection: 'APC / professional reflection',
            weekOutcome: 'The APC outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for APC research/study.',
            reviewQ4: 'What did I learn about my approach to APC research and problem-solving?',
            planCommit: 'My APC commitment',
            journeyTitle: 'For your APC journey',
            journey: 'Use the journal alongside your technical preparation. Your goal is not merely to complete study hours. Use these pages to build the habits of attention, reflection, research, professional judgment and sustained effort that support the long journey toward becoming a CA(SA).'
        },
        iac: {
            label: 'IAC (formerly ITC) candidate',
            study: 'IAC study / question practice',
            reflection: 'Technical reflection',
            weekOutcome: 'The IAC outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for IAC study and question practice.',
            reviewQ4: 'What did I learn about my approach to technical study and exam technique?',
            planCommit: 'My IAC commitment',
            journeyTitle: 'For your IAC journey',
            journey: 'Use the journal alongside your technical preparation. Your goal is not merely to complete study hours. Use these pages to build the habits of attention, reflection, honest self-assessment and sustained effort that carry you through the board exam.'
        },
        university: {
            label: 'University / CTA student',
            study: 'Study / lectures / tutorials',
            reflection: 'Academic reflection',
            weekOutcome: 'The academic outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for study.',
            reviewQ4: 'What did I learn about how I study and solve problems?',
            planCommit: 'My study commitment',
            journeyTitle: 'For your studies',
            journey: 'Use the journal alongside your coursework. Your goal is not merely to log hours at your desk. Use these pages to build the habits of attention, reflection and steady effort that turn a semester of pressure into real progress.'
        },
        trainee: {
            label: 'Trainee accountant',
            study: 'Work + study (training contract)',
            reflection: 'Professional reflection',
            weekOutcome: 'The work or study outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for study alongside work.',
            reviewQ4: 'What did I learn about balancing work, study and growth?',
            planCommit: 'My training-contract commitment',
            journeyTitle: 'For your training contract',
            journey: 'Use the journal alongside your work and studies. Your goal is not merely to survive busy season. Use these pages to build the habits of attention, reflection, professional judgment and sustained effort that make you the professional you are becoming.'
        },
        professional: {
            label: 'Professional (any field)',
            study: 'Deep work / professional development',
            reflection: 'Professional reflection',
            weekOutcome: 'The professional outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for deep work.',
            reviewQ4: 'What did I learn about how I approach my work and solve problems?',
            planCommit: 'My professional commitment',
            journeyTitle: 'For your work',
            journey: 'Use the journal alongside your work. Your goal is not merely to be busy. Use these pages to build the habits of attention, reflection, judgment and sustained effort that compound into a career you are proud of.'
        },
        personal: {
            label: 'Personal growth',
            study: 'Focused time on my goal',
            reflection: 'Reflection on my goal',
            weekOutcome: 'The outcome I want to protect this week',
            weekStudy: 'I protected meaningful time for my main goal.',
            reviewQ4: 'What did I learn about how I pursue my goals?',
            planCommit: 'My goal commitment',
            journeyTitle: 'For your season',
            journey: 'Use the journal alongside whatever you are building right now. Your goal is not perfection. Use these pages to build the habits of attention, reflection and sustained effort that move you toward the person you are becoming.'
        }
    };

    var DAY0_QUESTIONS = [
        'What am I ultimately trying to become through this season?',
        "What is the compelling future vision that makes today's discipline worthwhile?",
        'Who am I building this discipline for, beyond myself?',
        'What is the story I normally tell myself when I fail?',
        'Write the counter-narrative that allows you to return.'
    ];

    var RULES = [
        'Keep the commitments small enough to survive difficult days.',
        'Record what actually happened, not what you wish had happened.',
        'When you miss, return. Do not turn one missed day into a collapsed identity.',
        'Review your direction regularly: formation over performance; devotion over self-condemnation.'
    ];

    var WEEKS = [
        { title: 'Purpose', subtitle: 'Understand why you are building discipline.', body: 'Direction before intensity. Define the person, purpose and commitments that make the practices meaningful.' },
        { title: 'Practice', subtitle: 'Establish the four pillars.', body: 'Build a repeatable rhythm of meditation, exercise, reading and writing, alongside your main work.' },
        { title: 'Resilience', subtitle: 'Learn how to return after disruption.', body: 'Study your obstacles rather than hiding from them. A setback becomes information for redesign.' },
        { title: 'Integration', subtitle: 'Turn 30 days into a longer architecture.', body: 'Review what the practice has revealed and design the next 90 days.' }
    ];

    var DAYS = [
        ['Vision', 'Write the future you are willing to work for.'],
        ['Why', 'What makes this season of discipline worth the cost?'],
        ['Control', 'Separate what is within your control from what is not. Act on what is yours.'],
        ['Environment', 'What in your environment makes discipline harder? What can you change?'],
        ['Minimum', "What is the smallest version of today's practice that still counts?"],
        ['Identity', 'Who are you becoming through what you repeatedly do?'],
        ['Review', 'What did the first week teach you about yourself?'],
        ['Attention', 'What repeatedly captures your attention when you intended to focus?'],
        ['Meditation', 'Practise stillness. What became visible when the noise reduced?'],
        ['Exercise', 'Treat movement as stewardship rather than comparison.'],
        ['Reading', 'What idea challenged or expanded your current thinking?'],
        ['Writing', 'What does honest writing reveal about the direction of your life?'],
        ['Research', 'Before searching for an answer, define the problem and the question.'],
        ['Depth', 'Where are you tempted to accept a quick answer without sufficient context?'],
        ['Community', 'Who helps you remain accountable to what you said you would do?'],
        ['Setback', 'What recent failure can become information rather than identity?'],
        ['Return', 'If you missed yesterday, what does returning today look like?'],
        ['Devotion', 'Ask: why am I doing this, and for whom?'],
        ['Discipline', 'Where are you relying on motivation when you could design a better system?'],
        ['Focus', 'What deserves your deepest attention today?'],
        ['Courage', 'What difficult task are you avoiding that would move your work forward?'],
        ['Patience', 'What result are you demanding too quickly?'],
        ['Marginal gains', 'What small improvement can compound if repeated?'],
        ['Consistency', 'What does an ordinary, faithful day look like?'],
        ['Professional formation', 'What kind of professional are your current habits forming?'],
        ['Service', 'How will your development eventually benefit people beyond yourself?'],
        ['Legacy', "What are you building that could outlast today's exam or season?"],
        ['AI era', 'What human capacities do you need to deepen rather than outsource?'],
        ['Recommitment', 'What are you choosing to continue after these 30 days?'],
        ['Manifesto', 'Write the commitments you intend to carry into the next season.']
    ].map(function (d, i) { return { day: i + 1, theme: d[0], prompt: d[1] }; });

    var DAILY_FIELDS = [
        { key: 'action', title: 'One meaningful action', hint: 'What is the one action that matters most today?' },
        { key: 'reflection', title: null, hint: 'What did I understand today that I did not understand yesterday? What question became clearer?' },
        { key: 'evening', title: 'Evening review', hint: 'What helped me follow through? What made it difficult? What will I change tomorrow?' },
        { key: 'returnStep', title: "Return, don't retreat", hint: 'If today was difficult, what is the smallest action that gets me moving again?' }
    ];

    var WEEK_FIELDS = [
        { key: 'intention', title: "This week's intention" },
        { key: 'outcome', title: null }, // stage-specific
        { key: 'obstacle', title: 'The distraction / obstacle I need to design around' },
        { key: 'accountability', title: 'My accountability commitment' }
    ];

    function weekChecks(stage) {
        return [
            { key: 'minimum', label: 'I kept my minimum practice most days.' },
            { key: 'lesson', label: 'I identified a useful lesson from a difficult day.' },
            { key: 'study', label: stage.weekStudy },
            { key: 'change', label: 'I know what I will change next week.' }
        ];
    }

    function reviewQuestions(stage) {
        return [
            'What changed in my daily behaviour?',
            'Which of the four practices became most natural? Which remained difficult?',
            'What did I learn about my distractions, environment and triggers?',
            stage.reviewQ4,
            'When I failed, how did I respond?',
            'Where do I currently sit on the performance-to-devotion spectrum, and why?'
        ];
    }

    window.JOURNAL_CONTENT = {
        title: '30-Day Discipline Journal',
        subtitle: 'Relentlessly Disciplined Practice Journal · Disciplined Disciples Academy',
        tagline: 'From intention to embodied practice.',
        closing: 'The goal is not to become perfect. The goal is to become formed.',
        commitment: 'I will not measure my formation only by the quality of individual days. I will pay attention to direction, return when I fall short, and continue building.',
        intro: 'This journal turns the central ideas of Relentlessly Disciplined into a 30-day practice. The aim is not perfection. The aim is formation: repeated, embodied practice in the direction of the person you are becoming.',
        introPractices: 'The book frames four practices as the daily architecture of formation: meditation, exercise, reading and writing. It also introduces the performance-to-devotion spectrum and asks the practitioner to return regularly to the question: Why am I doing this, and for whom?',
        minimumIntro: 'Before Day 1, define the smallest version of each practice you can complete even on a difficult day: an irreducible minimum rather than an ideal standard.',
        freeDays: 3,
        practices: PRACTICES,
        stages: STAGES,
        defaultStage: 'professional',
        day0Questions: DAY0_QUESTIONS,
        rules: RULES,
        weeks: WEEKS,
        days: DAYS,
        dailyFields: DAILY_FIELDS,
        weekFields: WEEK_FIELDS,
        weekChecks: weekChecks,
        reviewQuestions: reviewQuestions,
        devotionQuestion: 'Performance → Devotion check: Am I mainly trying to prove something, or am I tending something meaningful?',
        stageFor: function (key) { return STAGES[key] || STAGES.professional; },
        practiceLabel: function (practice, stageKey) {
            return practice.key === 'study' ? (STAGES[stageKey] || STAGES.professional).study : practice.label;
        }
    };
})();
