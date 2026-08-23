import { auth } from "@/auth";
import { ChatApp } from "@/components/chat/ChatApp";

export default async function Home() {
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email ?? "사용자";

  return <ChatApp userName={userName} />;
}
