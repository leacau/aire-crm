export function isAuthorizedCronRequest(request: Request) {
  const authHeader = request.headers.get('authorization');
  return !process.env.CRON_SECRET || authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
