"use client";

import { Message } from "@/app/product/Chat/Message";
import { MessageList } from "@/app/product/Chat/MessageList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormEvent, useMemo, useState } from "react";

type LocalMessage = {
  id: number;
  author: string;
  body: string;
};

export function Chat({ viewer }: { viewer: string }) {
  const [newMessageText, setNewMessageText] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>(() => [
    {
      id: Date.now(),
      author: "Concierge",
      body: "This is a static product demo. Messaging is available from the live dashboard under the Messaging tab.",
    },
  ]);

  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => b.id - a.id),
    [messages],
  );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = newMessageText.trim();
    if (!body) {
      return;
    }
    const message: LocalMessage = {
      id: Date.now(),
      author: viewer,
      body,
    };
    setMessages((current) => [...current, message]);
    setNewMessageText("");
  };

  return (
    <>
      <MessageList messages={sortedMessages}>
        {sortedMessages.map((message) => (
          <Message key={message.id} author={message.author} viewer={viewer}>
            {message.body}
          </Message>
        ))}
      </MessageList>
      <div className="border-t">
        <form onSubmit={handleSubmit} className="flex gap-2 p-4">
          <Input
            value={newMessageText}
            onChange={(event) => setNewMessageText(event.target.value)}
            placeholder="Write a message…"
          />
          <Button type="submit" disabled={newMessageText.trim() === ""}>
            Send
          </Button>
        </form>
      </div>
    </>
  );
}
