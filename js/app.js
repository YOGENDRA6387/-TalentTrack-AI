let currentAnalysisData = null;
let liveServerAvailable = false;

// Theme Manager Constants & Logic
const THEME_STORAGE_KEY = 'talent_track_theme';

function getAutoResolvedTheme() {
  const currentHour = new Date().getHours();
  // 6:00 AM (06:00) to 6:00 PM (18:00) -> Light mode; 6:00 PM (18:00) to 6:00 AM (06:00) -> Dark mode
  const isDay = currentHour >= 6 && currentHour < 18;
  return {
    theme: isDay ? 'light' : 'dark',
    phase: isDay ? 'Day' : 'Night'
  };
}

function applyThemeMode(mode, save = true) {
  if (save) {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  }

  const autoInfo = getAutoResolvedTheme();
  let resolvedTheme = mode;

  if (mode === 'auto') {
    resolvedTheme = autoInfo.theme;
  }

  document.documentElement.setAttribute('data-theme', resolvedTheme);
  document.documentElement.setAttribute('data-theme-mode', mode);

  // Update theme button active classes
  const buttons = {
    light: document.getElementById('theme-btn-light'),
    dark: document.getElementById('theme-btn-dark'),
    auto: document.getElementById('theme-btn-auto')
  };

  Object.keys(buttons).forEach(key => {
    if (buttons[key]) {
      buttons[key].classList.toggle('active', key === mode);
    }
  });

  // Update auto badge indicator (Day / Night)
  const autoIndicator = document.getElementById('theme-auto-indicator');
  if (autoIndicator) {
    autoIndicator.textContent = autoInfo.phase;
    autoIndicator.title = `Current time resolves to ${autoInfo.phase} (${autoInfo.theme === 'light' ? 'Light Ivory theme active' : 'Dark Obsidian theme active'})`;
  }
}

function initThemeManager() {
  const savedMode = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
  applyThemeMode(savedMode, false);

  const btnLight = document.getElementById('theme-btn-light');
  const btnDark = document.getElementById('theme-btn-dark');
  const btnAuto = document.getElementById('theme-btn-auto');

  if (btnLight) btnLight.addEventListener('click', () => applyThemeMode('light'));
  if (btnDark) btnDark.addEventListener('click', () => applyThemeMode('dark'));
  if (btnAuto) btnAuto.addEventListener('click', () => applyThemeMode('auto'));

  // Periodic check: every 60 seconds, if mode is auto, transition automatically if 6AM/6PM boundary crossed
  setInterval(() => {
    const currentMode = localStorage.getItem(THEME_STORAGE_KEY) || 'auto';
    if (currentMode === 'auto') {
      applyThemeMode('auto', false);
    }
  }, 60000);
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeManager();
  initServerCheck();
  bindEvents();
  loadPresetResume('ananya');
});

// Check if Python FastAPI server is active
async function initServerCheck() {
  const statusDot = document.getElementById('server-dot');
  const statusText = document.getElementById('server-text');
  const dbStatusText = document.getElementById('db-status-text');
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('http://127.0.0.1:8000/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const health = await res.json();
      liveServerAvailable = true;
      statusDot.style.backgroundColor = 'var(--pass-color)';
      statusDot.style.boxShadow = '0 0 10px var(--pass-color)';
      statusText.textContent = 'FastAPI Engine Active';
      dbStatusText.textContent = health.database || 'MongoDB Active';
    } else {
      throw new Error("Offline");
    }
  } catch (e) {
    liveServerAvailable = false;
    statusDot.style.backgroundColor = 'var(--warn-color)';
    statusDot.style.boxShadow = '0 0 10px var(--warn-color)';
    statusText.textContent = 'Browser Standalone Mode (Client NLP)';
    dbStatusText.textContent = 'Local Storage Fallback';
  }
}

function bindEvents() {
  // Form submission
  document.getElementById('analysis-form').addEventListener('submit', handleAnalyze);

  // Preset resume clicks
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (!btn.getAttribute('data-preset')) return;
      document.querySelectorAll('.preset-btn[data-preset]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const key = btn.getAttribute('data-preset');
      loadPresetResume(key);
    });
  });

  // PDF File Input Change
  const fileInput = document.getElementById('resume-file-input');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        document.getElementById('selected-file-name').textContent = `Selected PDF File: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        // If file is text readable locally, populate text preview
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (typeof evt.target.result === 'string' && evt.target.result.trim()) {
            document.getElementById('resume-text-input').value = evt.target.result;
          }
        };
        reader.readAsText(file);
      }
    });
  }

  // Export JSON / Print Report
  document.getElementById('export-json-btn').addEventListener('click', exportJSON);
  document.getElementById('print-report-btn').addEventListener('click', () => window.print());
}

function loadPresetResume(key) {
  const preset = SAMPLE_RESUMES[key];
  if (!preset) return;
  
  document.getElementById('resume-text-input').value = preset.text;
  document.getElementById('selected-file-name').textContent = `Loaded sample: ${preset.name} (${preset.role})`;
}

async function handleAnalyze(e) {
  e.preventDefault();
  
  const companyName = document.getElementById('company-name').value || "TalentTrack AI";
  const jobRole = document.getElementById('job-role').value || "Senior AI / ML Engineer";
  const jobDesc = document.getElementById('job-desc').value;
  const reqSkillsStr = document.getElementById('req-skills').value;
  const minExp = document.getElementById('min-exp').value || 3;
  const minEdu = document.getElementById('min-edu').value || "B.Tech Computer Science";
  const resumeText = document.getElementById('resume-text-input').value;
  const fileInput = document.getElementById('resume-file-input');
  const uploadedFile = fileInput && fileInput.files ? fileInput.files[0] : null;
  
  const reqSkillsList = reqSkillsStr.split(',').map(s => s.trim()).filter(Boolean);
  
  const jobData = {
    company_name: companyName,
    job_role: jobRole,
    job_description: jobDesc,
    required_skills: reqSkillsList,
    min_experience: minExp,
    min_education: minEdu
  };
  
  // Show loading indicator
  const analyzeBtn = document.getElementById('analyze-btn');
  const originalText = analyzeBtn.innerHTML;
  analyzeBtn.innerHTML = '⚡ Processing Resume with PyMuPDF & ML...';
  analyzeBtn.disabled = true;

  try {
    let data = null;
    
    if (liveServerAvailable) {
      const formData = new FormData();
      formData.append('company_name', companyName);
      formData.append('job_role', jobRole);
      formData.append('job_description', jobDesc);
      formData.append('required_skills_json', JSON.stringify(reqSkillsList));
      formData.append('min_experience', minExp);
      formData.append('min_education', minEdu);
      
      if (uploadedFile) {
        formData.append('file', uploadedFile);
      } else {
        formData.append('resume_text', resumeText);
      }
      
      const res = await fetch('http://127.0.0.1:8000/api/analyze', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        data = await res.json();
      }
    }
    
    // Fallback to client-side simulator if backend offline or request failed
    if (!data) {
      data = LocalNLPSimulator.analyzeCandidate(resumeText, jobData);
    }
    
    currentAnalysisData = data;
    renderResults(data);
    
    // Smooth scroll to results
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    console.error("Analysis Error:", err);
    alert("Error performing resume analysis. Please try again.");
  } finally {
    analyzeBtn.innerHTML = originalText;
    analyzeBtn.disabled = false;
  }
}

function renderResults(data) {
  const candidate = data.candidate;
  const scores = data.scores;
  const eligibility = data.eligibility_breakdown;
  const careers = data.career_mapping;
  const report = data.ai_recommendation_report;
  const layout = data.layout_analysis || { layout_score: 85, layout_suggestions: ["Clean layout structure detected."] };
  const dl = data.deep_learning_embedding || { dl_similarity_score: 75.0, dl_framework: "Transformer Embedding" };
  
  // 1. Hero Scores
  updateGauge('overall-score-gauge', 'overall-score-val', scores.overall_score);
  updateGauge('ats-score-gauge', 'ats-score-val', scores.ats_score);
  updateGauge('skill-score-gauge', 'skill-score-val', scores.skill_match_percentage);
  
  // DB record tag
  const dbTag = document.getElementById('db-record-tag');
  if (dbTag) {
    dbTag.textContent = `DB ID: ${data.db_record_id || 'mem_log'}`;
  }

  // Verdict badge
  const verdictEl = document.getElementById('verdict-badge-el');
  verdictEl.textContent = `${scores.verdict} — ${scores.verdict_badge}`;
  verdictEl.className = `panel-tag badge-${scores.verdict === 'SHORTLIST' ? 'pass' : (scores.verdict === 'CONSIDER' ? 'warn' : 'fail')}`;
  
  document.getElementById('verdict-summary').textContent = scores.summary_text;
  
  // Candidate Header Info
  document.getElementById('cand-name').textContent = candidate.name;
  document.getElementById('cand-meta').textContent = `${candidate.years_of_experience} yrs exp • ${candidate.education}`;
  
  // 2. Extracted Skills Pills
  const matchedPills = document.getElementById('matched-skills-container');
  matchedPills.innerHTML = candidate.matched_skills.map(s => `<span class="pill matched">✓ ${s}</span>`).join('');
  
  const missingPills = document.getElementById('missing-skills-container');
  if (candidate.missing_skills && candidate.missing_skills.length > 0) {
    missingPills.innerHTML = candidate.missing_skills.map(s => `<span class="pill missing">✕ ${s}</span>`).join('');
  } else {
    missingPills.innerHTML = '<span class="pill matched">✓ Complete tech stack match!</span>';
  }
  
  // 3. Layout & Deep Learning Analysis
  document.getElementById('layout-score-val').textContent = `${layout.layout_score}%`;
  document.getElementById('layout-status-desc').textContent = layout.ats_friendly ? "ATS Compliant Structure" : "Needs Layout Tweaks";
  
  document.getElementById('dl-score-val').textContent = `${dl.dl_similarity_score}%`;
  document.getElementById('dl-framework-desc').textContent = `${dl.dl_framework || 'Neural Engine'} Similarity`;
  
  const layoutSuggContainer = document.getElementById('layout-suggestions-container');
  if (layoutSuggContainer && layout.layout_suggestions) {
    layoutSuggContainer.innerHTML = layout.layout_suggestions.map(s => `• ${s}`).join('<br>');
  }

  // 4. Eligibility List
  const eligListContainer = document.getElementById('eligibility-list-container');
  eligListContainer.innerHTML = eligibility.map(item => `
    <div class="eligibility-item">
      <div class="eligibility-left">
        <div class="check-icon ${item.status.toLowerCase()}">${item.status === 'PASS' ? '✓' : (item.status === 'WARN' ? '!' : '✕')}</div>
        <div>
          <div class="eligibility-title">${item.name}</div>
          <div class="eligibility-req">${item.required} • ${item.note}</div>
        </div>
      </div>
      <div class="eligibility-val">${item.candidate_val}</div>
    </div>
  `).join('');
  
  // 5. Career Intelligence Grid ("What Jobs Should They Pursue?")
  const careerGrid = document.getElementById('career-grid-container');
  careerGrid.innerHTML = careers.map(c => `
    <div class="career-card ${c.is_top_pick ? 'top-pick' : ''}">
      ${c.is_top_pick ? '<div class="top-pick-tag">Top Pick</div>' : ''}
      <div class="career-role">${c.role}</div>
      <div class="career-score">${c.match_score}% <span style="font-size:12px; font-weight:600; color:var(--text-muted);">match score</span></div>
      <div class="career-salary">${c.salary_range}</div>
      <div class="career-demand">${c.demand}</div>
      <div class="skill-pills">
        ${c.skills.map(s => `<span class="pill">${s}</span>`).join('')}
      </div>
    </div>
  `).join('');

  // 6. Certificate & Project Advice
  const certAdviceContainer = document.getElementById('cert-advice-container');
  if (certAdviceContainer && report.certificate_advice) {
    certAdviceContainer.innerHTML = report.certificate_advice.map(c => `
      <div class="info-subbox" style="margin-bottom:6px; padding:10px 12px; font-size:12px;">
        🏆 ${c}
      </div>
    `).join('');
  }

  const projAdviceContainer = document.getElementById('project-advice-container');
  if (projAdviceContainer && report.project_suggestions) {
    projAdviceContainer.innerHTML = report.project_suggestions.map(p => `
      <div class="info-subbox" style="margin-bottom:6px; padding:10px 12px; font-size:12px;">
        💻 ${p}
      </div>
    `).join('');
  }
  
  // 7. Learning Roadmap
  const roadmapContainer = document.getElementById('roadmap-container');
  roadmapContainer.innerHTML = report.learning_roadmap.map((step, idx) => `
    <div class="roadmap-step">
      <div class="step-num">${idx + 1}</div>
      <div class="step-content">
        <div class="step-title">${step.phase || step.step}: ${step.focus || step.title}</div>
        <div class="step-desc">${step.action}</div>
      </div>
    </div>
  `).join('');
}

function updateGauge(circleId, textId, val) {
  const circle = document.getElementById(circleId);
  const text = document.getElementById(textId);
  if (!circle || !text) return;
  
  const circumference = 2 * Math.PI * 42; // r=42
  const offset = circumference - (val / 100) * circumference;
  
  circle.style.strokeDasharray = `${circumference} ${circumference}`;
  circle.style.strokeDashoffset = offset;
  text.textContent = `${val}%`;
}

function exportJSON() {
  if (!currentAnalysisData) return;
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentAnalysisData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "Talent_Track_AI_Report.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
