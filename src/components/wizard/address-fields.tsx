"use client";

import { useFormContext, useWatch, type FieldValues, type Path } from "react-hook-form";
import { ADDRESS_COUNTRIES } from "@/lib/countries";
import { addressFormatFor } from "@/lib/validation/address";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Street address group bound to `${name}.line1` etc. Region and postcode
 * adapt to the selected country (states for AU/US, nations for the UK).
 */
export function AddressFields<T extends FieldValues>({
  name,
  lockCountry,
  lockRegion,
  label,
}: {
  name: string;
  lockCountry?: boolean;
  lockRegion?: boolean;
  label?: string;
}) {
  const form = useFormContext<T>();
  const field = (key: string) => `${name}.${key}` as Path<T>;
  const country = useWatch({ control: form.control, name: field("country") }) as string | undefined;
  const format = country ? addressFormatFor(country) : undefined;

  return (
    <fieldset className="grid gap-3 sm:grid-cols-6">
      {label && <legend className="mb-2 text-sm font-medium sm:col-span-6">{label}</legend>}
      <FormField
        control={form.control}
        name={field("line1")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-6">
            <FormLabel>Street address</FormLabel>
            <FormControl>
              <Input autoComplete="address-line1" placeholder="Level 3, 100 Example Street" {...f} value={f.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={field("line2")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-6">
            <FormControl>
              <Input autoComplete="address-line2" placeholder="Apartment, suite (optional)" {...f} value={f.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={field("city")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>{country === "AU" ? "Suburb" : "City"}</FormLabel>
            <FormControl>
              <Input autoComplete="address-level2" {...f} value={f.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={field("region")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>{format?.regionLabel ?? "Region"}</FormLabel>
            {format ? (
              <Select value={f.value || undefined} onValueChange={f.onChange} disabled={lockRegion}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {format.regions.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <FormControl>
                <Input autoComplete="address-level1" {...f} value={f.value ?? ""} />
              </FormControl>
            )}
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={field("postcode")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>{format?.postcodeLabel ?? "Postal code"}</FormLabel>
            <FormControl>
              <Input autoComplete="postal-code" {...f} value={f.value ?? ""} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={field("country")}
        render={({ field: f }) => (
          <FormItem className="sm:col-span-6">
            <FormLabel>Country</FormLabel>
            <Select
              value={f.value || undefined}
              onValueChange={(v) => {
                f.onChange(v);
                form.setValue(field("region"), "" as never);
              }}
              disabled={lockCountry}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select country" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {ADDRESS_COUNTRIES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
    </fieldset>
  );
}
