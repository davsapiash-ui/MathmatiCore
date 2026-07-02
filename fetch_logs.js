const fs = require('fs');

async function fetchLogs() {
  try {
    const res = await fetch('https://api.github.com/repos/davsapiash-ui/MathmatiCore/actions/runs?per_page=1');
    const data = await res.json();
    const runId = data.workflow_runs[0].id;
    console.log('Run ID:', runId);

    const jobsRes = await fetch(`https://api.github.com/repos/davsapiash-ui/MathmatiCore/actions/runs/${runId}/jobs`);
    const jobsData = await jobsRes.json();
    const job = jobsData.jobs[0];
    
    console.log('Failed step:', job.steps.find(s => s.conclusion === 'failure')?.name);
    console.log('Job URL:', job.html_url);
    
    const logsRes = await fetch(`https://api.github.com/repos/davsapiash-ui/MathmatiCore/actions/jobs/${job.id}/logs`, {
      redirect: 'follow'
    });
    const logsText = await logsRes.text();
    console.log('Log snippet:');
    console.log(logsText.slice(-1500));
  } catch (e) {
    console.error(e);
  }
}

fetchLogs();
