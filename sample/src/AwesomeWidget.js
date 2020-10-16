import React from "react";
import PropTypes from "prop-types";
import i18n from "shared/i18n";

export default class AwesomeWidget extends React.Component {
  constructor(props) {
    super(props);

    this.handleClick = this.handleClick.bind(this);
  }

  handleClick() {
    this.prop.onClick();
  }

  render() {
    return (
      <div className="awesome_design_system_flex">
        <h2>{i18n.t("awesome_widget.header")}</h2>
        <button onClick={this.handleClick}>
          {i18n.t("awesome_widget.primary_cta")}
        </button>
      </div>
    );
  }
}
AwesomeWidget.PropTypes = {
  onClick: PropTypes.func.isRequired,
};
