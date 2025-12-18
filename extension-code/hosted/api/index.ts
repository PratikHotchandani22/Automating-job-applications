import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    name: 'Resume Intelligence API',
    version: '1.0.0',
    status: 'online',
    endpoints: {
      health: '/api/health',
      analyze: '/api/analyze',
      runs: '/api/runs',
      status: '/api/status/:runId'
    },
    documentation: 'https://github.com/your-repo'
  });
}

