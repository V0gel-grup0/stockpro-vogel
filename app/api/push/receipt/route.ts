import { acknowledgePushTest } from "@/lib/push-server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request: Request) {
  try {
    const body=await request.text();
    if(body.length<=512){const data=JSON.parse(body);await acknowledgePushTest(data.testId,data.state);}
  }catch{}
  return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
}
