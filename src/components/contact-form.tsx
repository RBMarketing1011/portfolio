"use client"

import { type FormEvent, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

type FormStatus = "idle" | "sending" | "success" | "error"

export default function ContactForm ()
{
  const [status, setStatus] = useState<FormStatus>("idle")

  async function handleSubmit (event: FormEvent<HTMLFormElement>)
  {
    event.preventDefault()
    setStatus("sending")
    const form = event.currentTarget
    const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form))) })
    setStatus(response.ok ? "success" : "error")
    if (response.ok) form.reset()
  }

  return <form onSubmit={ handleSubmit } className="space-y-5"><div className="grid gap-5 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="name">Name</Label><Input id="name" name="name" required /></div><div className="space-y-2"><Label htmlFor="email">Work email</Label><Input id="email" name="email" type="email" required /></div></div><div className="space-y-2"><Label htmlFor="company">Company</Label><Input id="company" name="company" /></div><div className="space-y-2"><Label htmlFor="message">What are you looking to build?</Label><Textarea id="message" name="message" required /></div><Button type="submit" size="lg" disabled={ status === "sending" } className="w-full bg-[#1684f5] text-[#02101f] hover:bg-[#4aa2fb]">{ status === "sending" ? "Sending..." : "Send inquiry" }</Button>{ status === "success" && <p className="text-sm text-emerald-400">Thanks. Your inquiry has been sent.</p> }{ status === "error" && <p className="text-sm text-red-400">Something went wrong. Please try again or email us directly.</p> }</form>
}