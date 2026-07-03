"use client"

import { useState } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import type { ArticleOption } from "@/lib/cms/marketing-pushes"

export function ArticleCombobox({
  options,
  value,
  onChange,
}: {
  options: ArticleOption[]
  value: string | null
  onChange: (id: string | null) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.id === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" role="combobox" className="w-full justify-between text-sm font-normal">
          <span className="truncate">{selected ? selected.title : "Link an article (optional)"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[380px] p-0">
        <Command>
          <CommandInput placeholder="Search articles…" />
          <CommandList>
            <CommandEmpty>No articles found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => { onChange(null); setOpen(false) }}>
                <Check className={`mr-2 h-4 w-4 ${value ? "opacity-0" : "opacity-100"}`} />
                No article
              </CommandItem>
              {options.map((o) => (
                <CommandItem key={o.id} value={`${o.title} ${o.id}`} onSelect={() => { onChange(o.id); setOpen(false) }}>
                  <Check className={`mr-2 h-4 w-4 ${value === o.id ? "opacity-100" : "opacity-0"}`} />
                  <span className="truncate">{o.title}</span>
                  <span className="ml-auto pl-2 text-xs text-muted-foreground">{o.status}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
