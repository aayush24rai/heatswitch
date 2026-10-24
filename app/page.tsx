import { Button } from "@/components/ui/button"

export default function Page() {
  return (
    <div className="flex min-h-svh p-6">
      <div className="flex max-w-md min-w-0 flex-col gap-4 text-sm leading-loose">
        <div>
          <h1 className="font-medium">HeatSwitch — project ready</h1>
          <p>Know before you switch. The UI shell arrives in a later task.</p>
          <Button className="mt-2">Button</Button>
        </div>
      </div>
    </div>
  )
}
