import { RegistrationForm } from "@/components/forms/SignupForm"
import { PokeFindrIcon } from "@/components/icons/PokeFindrIcon"
import { Link } from "lucide-react"

export default function LoginPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-gray-100 p-6 md:p-10">
      <div className="z-1000 flex w-full max-w-sm flex-col gap-6">
        <Link href="/" className="flex items-center gap-2 self-center font-medium">
          <div className="bg-transparent text-primary-foreground flex size-6 items-center justify-center rounded-md">
            <PokeFindrIcon width={20} height={20} /> 
          </div>
          Pokefindr 
        </Link>
        <RegistrationForm />
      </div>
    </div>
  )
}
