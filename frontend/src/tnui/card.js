import { semantic_props, ui } from "./runtime.js";

export function Card(props = {}, children = []) {
  return ui.CardPrimitive.Card(semantic_props(props, "tn-card", "card-root"), children);
}

export function CardHeader(props = {}, children = []) {
  return ui.CardPrimitive.CardHeader(semantic_props(props, "tn-card__header", "card-header"), children);
}

export function CardTitle(props = {}, children = []) {
  return ui.CardPrimitive.CardTitle(semantic_props(props, "tn-card__title", "card-title"), children);
}

export function CardDescription(props = {}, children = []) {
  return ui.CardPrimitive.CardDescription(semantic_props(props, "tn-card__description", "card-description"), children);
}

export function CardContent(props = {}, children = []) {
  return ui.CardPrimitive.CardContent(semantic_props(props, "tn-card__content", "card-content"), children);
}

export function CardFooter(props = {}, children = []) {
  return ui.CardPrimitive.CardFooter(semantic_props(props, "tn-card__footer", "card-footer"), children);
}
